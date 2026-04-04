"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type LocalSnapshot = Record<string, string>;

const LOCAL_KEY_PREFIX = "casemate.";
const ACTIVE_WORKSPACE_KEY = "casemate.active-workspace-id.v1";
const LOCAL_SYNC_AT_PREFIX = "casemate.cloud-sync-at";
const DEFAULT_TABLE = "app_snapshots";
const DEFAULT_OFFICE_ID = "main-office";

function getConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const table =
    process.env.NEXT_PUBLIC_CASEMATE_SNAPSHOT_TABLE?.trim() || DEFAULT_TABLE;
  const officeId =
    process.env.NEXT_PUBLIC_CASEMATE_OFFICE_ID?.trim() ||
    process.env.NEXT_PUBLIC_CASEMATE_WORKSPACE_ID?.trim() ||
    DEFAULT_OFFICE_ID;

  if (!url || !anonKey) {
    return null;
  }

  return {
    url,
    anonKey,
    table,
    officeId,
  };
}

export function isCloudSyncEnabled() {
  return Boolean(getConfig());
}

export function buildWorkspaceIdForUser(userId: string) {
  const officeId =
    process.env.NEXT_PUBLIC_CASEMATE_OFFICE_ID?.trim() ||
    process.env.NEXT_PUBLIC_CASEMATE_WORKSPACE_ID?.trim() ||
    DEFAULT_OFFICE_ID;
  return `${userId}:${officeId}`;
}

function getSyncAtKey(workspaceId: string) {
  return `${LOCAL_SYNC_AT_PREFIX}.${workspaceId}`;
}

export function setActiveWorkspaceId(workspaceId: string) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
}

function getActiveWorkspaceId() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(ACTIVE_WORKSPACE_KEY) ?? "";
}

const BACKUP_KEY = "casemate.__safety-backup__.v1";

function backupLocalWorkspaceData() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const snapshot = readLocalSnapshot();
    if (hasMeaningfulLocalData(snapshot)) {
      window.localStorage.setItem(BACKUP_KEY, JSON.stringify({
        backedUpAt: new Date().toISOString(),
        snapshot,
      }));
    }
  } catch {
    // best-effort
  }
}

function clearLocalWorkspaceData() {
  if (typeof window === "undefined") {
    return;
  }

  // Always create a safety backup before clearing
  backupLocalWorkspaceData();

  const keysToRemove: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(LOCAL_KEY_PREFIX)) {
      continue;
    }
    if (key === ACTIVE_WORKSPACE_KEY || key.startsWith(`${LOCAL_SYNC_AT_PREFIX}.`) || key === BACKUP_KEY) {
      continue;
    }
    keysToRemove.push(key);
  }

  keysToRemove.forEach((key) => {
    window.localStorage.removeItem(key);
  });
}

function readLocalSnapshot(): LocalSnapshot {
  if (typeof window === "undefined") {
    return {};
  }

  const snapshot: LocalSnapshot = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (
      !key ||
      !key.startsWith(LOCAL_KEY_PREFIX) ||
      key === ACTIVE_WORKSPACE_KEY ||
      key.startsWith(`${LOCAL_SYNC_AT_PREFIX}.`)
    ) {
      continue;
    }

    const value = window.localStorage.getItem(key);
    snapshot[key] = value ?? "";
  }
  return snapshot;
}

function writeLocalSnapshot(snapshot: Record<string, unknown>) {
  if (typeof window === "undefined") {
    return;
  }

  for (const [key, value] of Object.entries(snapshot)) {
    if (!key.startsWith(LOCAL_KEY_PREFIX)) {
      continue;
    }
    if (typeof value === "string") {
      window.localStorage.setItem(key, value);
      continue;
    }
    window.localStorage.setItem(key, JSON.stringify(value));
  }
}

function hasMeaningfulLocalData(snapshot: LocalSnapshot) {
  const values = Object.values(snapshot);
  if (values.length === 0) {
    return false;
  }

  return values.some((value) => {
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed !== "{}" && trimmed !== "[]";
  });
}

function parseTimestamp(value: string | null) {
  if (!value) {
    return Number.NaN;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

async function getAuthedConfig() {
  const config = getConfig();
  const supabase = getSupabaseBrowserClient();
  if (!config || !supabase) {
    return null;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const userId = session?.user?.id;
  if (!userId) {
    return null;
  }

  const expectedWorkspaceId = `${userId}:${config.officeId}`;
  return {
    ...config,
    supabase,
    userId,
    workspaceId: expectedWorkspaceId,
  };
}

async function fetchRemoteSnapshot(workspaceId: string) {
  const authed = await getAuthedConfig();
  if (!authed) {
    return null;
  }

  const { data, error } = await authed.supabase
    .from(authed.table)
    .select("workspace_id,snapshot,updated_at")
    .eq("workspace_id", workspaceId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function upsertRemoteSnapshot(workspaceId: string, snapshot: LocalSnapshot) {
  const authed = await getAuthedConfig();
  if (!authed || typeof window === "undefined") {
    return;
  }

  const nowIso = new Date().toISOString();
  const { error } = await authed.supabase.from(authed.table).upsert(
    {
      workspace_id: workspaceId,
      snapshot,
      updated_at: nowIso,
    },
    {
      onConflict: "workspace_id",
    },
  );

  if (error) {
    throw error;
  }

  window.localStorage.setItem(getSyncAtKey(workspaceId), nowIso);
}

export async function prepareCloudStateBeforeMount() {
  if (typeof window === "undefined" || !isCloudSyncEnabled()) {
    return;
  }

  try {
    const authed = await getAuthedConfig();
    if (!authed) {
      return;
    }

    const previousWorkspaceId = getActiveWorkspaceId();
    const workspaceSwitched =
      previousWorkspaceId && previousWorkspaceId !== authed.workspaceId;

    if (workspaceSwitched) {
      // Safety: backup before clearing
      backupLocalWorkspaceData();
      clearLocalWorkspaceData();
      window.localStorage.removeItem(getSyncAtKey(previousWorkspaceId));
    }

    setActiveWorkspaceId(authed.workspaceId);

    const localSnapshot = readLocalSnapshot();
    const localHasData = hasMeaningfulLocalData(localSnapshot);
    const localSyncedAtMs = parseTimestamp(
      window.localStorage.getItem(getSyncAtKey(authed.workspaceId)),
    );

    let remote: Awaited<ReturnType<typeof fetchRemoteSnapshot>> = null;
    try {
      remote = await fetchRemoteSnapshot(authed.workspaceId);
    } catch (error) {
      console.warn("[Cloud Sync] Could not fetch remote, keeping local data:", error);
      return;
    }

    const remoteHasData =
      remote &&
      remote.snapshot &&
      typeof remote.snapshot === "object" &&
      !Array.isArray(remote.snapshot) &&
      hasMeaningfulLocalData(
        Object.fromEntries(
          Object.entries(remote.snapshot as Record<string, unknown>).map(
            ([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)],
          ),
        ),
      );

    if (remoteHasData) {
      const remoteUpdatedAtMs = parseTimestamp(remote!.updated_at ?? null);

      // SAFETY: Never overwrite local data with remote unless remote is genuinely newer
      // If local has data, only pull remote when timestamps confirm remote is newer
      const shouldPullRemote =
        !localHasData ||
        (!Number.isNaN(remoteUpdatedAtMs) &&
          !Number.isNaN(localSyncedAtMs) &&
          remoteUpdatedAtMs > localSyncedAtMs);

      if (shouldPullRemote) {
        // Backup local before overwriting
        if (localHasData) {
          backupLocalWorkspaceData();
        }
        writeLocalSnapshot(remote!.snapshot as Record<string, unknown>);
        if (remote!.updated_at) {
          window.localStorage.setItem(
            getSyncAtKey(authed.workspaceId),
            remote!.updated_at,
          );
        }
        return;
      }
    }

    // SAFETY: If local has data but remote is empty, push local to remote (bootstrap)
    // Never discard local data just because remote is empty
    if (localHasData) {
      await upsertRemoteSnapshot(authed.workspaceId, localSnapshot);
    }
  } catch (error) {
    console.warn("[Cloud Sync] Startup sync skipped:", error);
  }
}

/**
 * Restore data from the safety backup (if one exists).
 * Returns true if data was restored.
 */
export function restoreFromSafetyBackup(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const raw = window.localStorage.getItem(BACKUP_KEY);
    if (!raw) {
      return false;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.snapshot || typeof parsed.snapshot !== "object") {
      return false;
    }
    writeLocalSnapshot(parsed.snapshot);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a safety backup exists with data.
 */
export function hasSafetyBackup(): { exists: boolean; backedUpAt: string } {
  if (typeof window === "undefined") {
    return { exists: false, backedUpAt: "" };
  }
  try {
    const raw = window.localStorage.getItem(BACKUP_KEY);
    if (!raw) {
      return { exists: false, backedUpAt: "" };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.snapshot || typeof parsed.snapshot !== "object") {
      return { exists: false, backedUpAt: "" };
    }
    return { exists: true, backedUpAt: parsed.backedUpAt ?? "" };
  } catch {
    return { exists: false, backedUpAt: "" };
  }
}

/**
 * Attempt to recover data from the remote Supabase snapshot.
 * Returns true if remote data was found and written to localStorage.
 */
export async function recoverFromRemote(): Promise<boolean> {
  if (typeof window === "undefined" || !isCloudSyncEnabled()) {
    return false;
  }
  try {
    const authed = await getAuthedConfig();
    if (!authed) {
      return false;
    }
    const remote = await fetchRemoteSnapshot(authed.workspaceId);
    if (!remote || !remote.snapshot || typeof remote.snapshot !== "object") {
      return false;
    }
    const remoteSnapshot = Object.fromEntries(
      Object.entries(remote.snapshot as Record<string, unknown>).map(
        ([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)],
      ),
    );
    if (!hasMeaningfulLocalData(remoteSnapshot)) {
      return false;
    }
    writeLocalSnapshot(remote.snapshot as Record<string, unknown>);
    if (remote.updated_at) {
      window.localStorage.setItem(getSyncAtKey(authed.workspaceId), remote.updated_at);
    }
    return true;
  } catch {
    return false;
  }
}

export async function pushLocalStateToCloud() {
  if (typeof window === "undefined" || !isCloudSyncEnabled()) {
    return;
  }

  try {
    const authed = await getAuthedConfig();
    if (!authed) {
      return;
    }

    if (getActiveWorkspaceId() !== authed.workspaceId) {
      setActiveWorkspaceId(authed.workspaceId);
    }

    const localSnapshot = readLocalSnapshot();
    if (!hasMeaningfulLocalData(localSnapshot)) {
      return;
    }
    await upsertRemoteSnapshot(authed.workspaceId, localSnapshot);
  } catch (error) {
    console.warn("[Cloud Sync] Autosave failed:", error);
  }
}
