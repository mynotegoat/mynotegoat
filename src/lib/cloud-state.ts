"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type LocalSnapshot = Record<string, string>;

const LOCAL_KEY_PREFIX = "casemate.";
const ACTIVE_WORKSPACE_KEY = "casemate.active-workspace-id.v1";
const LOCAL_SYNC_AT_PREFIX = "casemate.cloud-sync-at";
const DEFAULT_TABLE = "app_snapshots";
const DEFAULT_OFFICE_ID = "main-office";
const ALLOW_LOCAL_BOOTSTRAP = process.env.NEXT_PUBLIC_CASEMATE_ALLOW_LOCAL_BOOTSTRAP === "1";

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

function clearLocalWorkspaceData() {
  if (typeof window === "undefined") {
    return;
  }

  const keysToRemove: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(LOCAL_KEY_PREFIX)) {
      continue;
    }
    if (key === ACTIVE_WORKSPACE_KEY || key.startsWith(`${LOCAL_SYNC_AT_PREFIX}.`)) {
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
    if (previousWorkspaceId && previousWorkspaceId !== authed.workspaceId) {
      clearLocalWorkspaceData();
    }

    setActiveWorkspaceId(authed.workspaceId);

    const localSnapshot = readLocalSnapshot();
    const localHasData = hasMeaningfulLocalData(localSnapshot);
    const localSyncedAtMs = parseTimestamp(
      window.localStorage.getItem(getSyncAtKey(authed.workspaceId)),
    );

    const remote = await fetchRemoteSnapshot(authed.workspaceId);

    if (
      remote &&
      remote.snapshot &&
      typeof remote.snapshot === "object" &&
      !Array.isArray(remote.snapshot)
    ) {
      const remoteUpdatedAtMs = parseTimestamp(remote.updated_at ?? null);
      const shouldPullRemote =
        !localHasData ||
        Number.isNaN(localSyncedAtMs) ||
        (!Number.isNaN(remoteUpdatedAtMs) && remoteUpdatedAtMs >= localSyncedAtMs);

      if (shouldPullRemote) {
        writeLocalSnapshot(remote.snapshot as Record<string, unknown>);
        if (remote.updated_at) {
          window.localStorage.setItem(getSyncAtKey(authed.workspaceId), remote.updated_at);
        }
        return;
      }
    }

    if (!ALLOW_LOCAL_BOOTSTRAP) {
      clearLocalWorkspaceData();
      window.localStorage.removeItem(getSyncAtKey(authed.workspaceId));
      return;
    }

    if (localHasData) {
      await upsertRemoteSnapshot(authed.workspaceId, localSnapshot);
    }
  } catch (error) {
    console.warn("[Cloud Sync] Startup sync skipped:", error);
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
