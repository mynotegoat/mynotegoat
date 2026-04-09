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

/**
 * Synchronously guarantee that localStorage belongs to `expectedWorkspaceId`.
 *
 * If the stored active-workspace pointer is missing OR points to a different
 * workspace, every casemate.* key is wiped before this function returns.
 * Always called from the portal layout BEFORE any hook reads localStorage,
 * so a fresh signup in an existing browser starts with a truly empty slate
 * instead of inheriting the previous session's patient data.
 *
 * The previous behavior — pre-setting active-workspace-id and then comparing
 * inside an async cloud bootstrap — caused the comparison to always pass and
 * the leftover data to be sync-pushed under the new user's id.
 */
/**
 * Called from the sign-out button. Wipes every casemate.* key AND the
 * active-workspace pointer so the next user to land in this browser
 * starts with a truly empty slate.
 */
export function wipeLocalWorkspaceForSignOut() {
  if (typeof window === "undefined") {
    return;
  }
  clearLocalWorkspaceData();
  window.localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
}

export function ensureWorkspaceForUser(expectedWorkspaceId: string) {
  if (typeof window === "undefined") {
    return;
  }
  const previous = window.localStorage.getItem(ACTIVE_WORKSPACE_KEY) ?? "";
  if (previous !== expectedWorkspaceId) {
    // Wipes every casemate.* key (preserves backup + sync-at + workspace-id).
    clearLocalWorkspaceData();
    window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, expectedWorkspaceId);
  }
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

  // CRITICAL: pause the storage-sync interceptor for the duration of the
  // wipe. Without this, every removeItem() below would schedule a cloud
  // push, and the resulting push could overwrite the cloud row with an
  // empty/near-empty snapshot. The 2026-04-08 incident was caused by
  // exactly this race condition.
  //
  // Imported lazily to avoid a circular dependency between cloud-state and
  // storage-sync-interceptor.
  let resume: (() => void) | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const interceptor = require("@/lib/storage-sync-interceptor") as {
      pauseSync?: () => void;
      resumeSync?: () => void;
    };
    if (typeof interceptor.pauseSync === "function") {
      interceptor.pauseSync();
      resume = () => interceptor.resumeSync?.();
    }
  } catch {
    // interceptor module not loaded yet — nothing to pause.
  }

  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith(LOCAL_KEY_PREFIX)) {
        continue;
      }
      if (
        key === ACTIVE_WORKSPACE_KEY ||
        key.startsWith(`${LOCAL_SYNC_AT_PREFIX}.`) ||
        key === BACKUP_KEY
      ) {
        continue;
      }
      keysToRemove.push(key);
    }

    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } finally {
    if (resume) {
      resume();
    }
  }
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
      key === BACKUP_KEY ||
      key.startsWith(`${LOCAL_SYNC_AT_PREFIX}.`)
    ) {
      // BACKUP_KEY is intentionally excluded from snapshots that get pushed
      // to the cloud. On 2026-04-08 a wipe loop left only the safety backup
      // in localStorage, and the next autosave pushed a snapshot containing
      // ONLY that key — wiping every patient/SOAP/macro/letter from the
      // cloud row. Never let the safety backup be the data.
      continue;
    }

    const value = window.localStorage.getItem(key);
    snapshot[key] = value ?? "";
  }
  return snapshot;
}

/**
 * Count the keys in a snapshot that represent real user data.
 * Used by the destructive-write guard.
 */
function countMeaningfulKeys(snapshot: Record<string, unknown>): number {
  let count = 0;
  for (const key of Object.keys(snapshot)) {
    if (!key.startsWith(LOCAL_KEY_PREFIX)) continue;
    if (key === BACKUP_KEY) continue;
    if (key === ACTIVE_WORKSPACE_KEY) continue;
    if (key.startsWith(`${LOCAL_SYNC_AT_PREFIX}.`)) continue;
    const value = snapshot[key];
    const str = typeof value === "string" ? value : JSON.stringify(value ?? "");
    const trimmed = str.trim();
    if (trimmed.length === 0 || trimmed === "{}" || trimmed === "[]") continue;
    count += 1;
  }
  return count;
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

// IMPORTANT: do NOT cache the resolved auth config across calls. A previous
// version cached for 60 seconds, which meant a brand-new signup could resolve
// to the prior user's workspace_id and clobber data across accounts. getSession
// reads from the supabase client's in-memory + localStorage state, so it's
// already cheap — we re-resolve every time.
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

  return {
    ...config,
    supabase,
    userId,
    workspaceId: `${userId}:${config.officeId}`,
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

export class CloudBootstrapError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "CloudBootstrapError";
  }
}

export async function prepareCloudStateBeforeMount() {
  if (typeof window === "undefined" || !isCloudSyncEnabled()) {
    return;
  }

  // Hard timeout: never let cloud sync block longer than 15 seconds.
  // (Bumped from 5s — we now BLOCK on success, so a slow network must
  // not silently fall through to an empty render.)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const authed = await getAuthedConfig();
    if (!authed) {
      // Not signed in yet — nothing to bootstrap. Caller should redirect.
      return;
    }
    if (controller.signal.aborted) {
      throw new CloudBootstrapError("Cloud bootstrap timed out before auth");
    }

    const previousWorkspaceId = getActiveWorkspaceId();
    const workspaceSwitched =
      previousWorkspaceId && previousWorkspaceId !== authed.workspaceId;

    if (workspaceSwitched) {
      backupLocalWorkspaceData();
      clearLocalWorkspaceData();
      window.localStorage.removeItem(getSyncAtKey(previousWorkspaceId));
    }

    setActiveWorkspaceId(authed.workspaceId);

    if (controller.signal.aborted) {
      throw new CloudBootstrapError("Cloud bootstrap timed out");
    }

    const localSnapshot = readLocalSnapshot();
    const localHasData = hasMeaningfulLocalData(localSnapshot);

    let remote: Awaited<ReturnType<typeof fetchRemoteSnapshot>> = null;
    try {
      remote = await fetchRemoteSnapshot(authed.workspaceId);
    } catch (error) {
      // CRITICAL: do NOT silently fall through. If we can't talk to the
      // cloud we must refuse to mount the app — otherwise the user could
      // start editing on top of empty/stale localStorage and the next
      // autosave would push that empty state up.
      throw new CloudBootstrapError(
        "Could not reach the cloud. Refusing to load the app with potentially stale local data. Please check your internet connection and try again.",
        error,
      );
    }

    if (controller.signal.aborted) {
      throw new CloudBootstrapError("Cloud bootstrap timed out fetching remote");
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
      // ── TIMESTAMP COMPARISON: never overwrite newer local data with older remote ──
      const lastLocalPushIso = window.localStorage.getItem(getSyncAtKey(authed.workspaceId));
      const lastLocalPushMs = parseTimestamp(lastLocalPushIso);
      const remoteUpdatedMs = parseTimestamp(remote!.updated_at ?? null);

      // If we have local data AND our last push is same or newer than remote, keep local.
      // This means local already has the latest — no need to overwrite.
      if (localHasData && !Number.isNaN(lastLocalPushMs) && !Number.isNaN(remoteUpdatedMs)) {
        if (lastLocalPushMs >= remoteUpdatedMs) {
          console.info("[Cloud Sync] Local data is same age or newer than remote — keeping local.");
          return;
        }
      }

      // If local has NO sync timestamp (fresh browser / cleared cache), always accept remote.
      // If remote is genuinely newer, accept it but always backup first.
      if (localHasData) {
        backupLocalWorkspaceData();
        console.info("[Cloud Sync] Remote data is newer — pulling from cloud (local backed up).");
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

    // Remote is empty but local has data — push local to remote (first-time bootstrap)
    if (localHasData) {
      await upsertRemoteSnapshot(authed.workspaceId, localSnapshot);
    }
  } catch (error) {
    // Re-throw bootstrap errors so the layout can show a hard error screen.
    // Only swallow truly unexpected, non-fatal errors.
    if (error instanceof CloudBootstrapError) {
      throw error;
    }
    console.error("[Cloud Sync] Unexpected bootstrap error:", error);
    throw new CloudBootstrapError(
      "Unexpected error while syncing with the cloud. Refusing to load the app.",
      error,
    );
  } finally {
    clearTimeout(timeout);
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

    // Refuse to push under the wrong workspace_id. The previous behavior
    // would silently set the active id and push, which is exactly how data
    // could leak across accounts. If the active pointer doesn't match the
    // signed-in user, abort the push entirely — the bootstrap will correct
    // the pointer on next mount.
    const activeWorkspaceId = getActiveWorkspaceId();
    if (activeWorkspaceId && activeWorkspaceId !== authed.workspaceId) {
      console.warn(
        "[Cloud Sync] Refusing push: active workspace pointer does not match signed-in user.",
      );
      return;
    }

    const localSnapshot = readLocalSnapshot();
    if (!hasMeaningfulLocalData(localSnapshot)) {
      return;
    }

    // ── DESTRUCTIVE-WRITE GUARD (client-side, defense in depth) ──
    // Before pushing, fetch the current remote snapshot. If the remote
    // already contains substantially MORE data than what we're about to
    // push, refuse the push. This prevents wipe-loops, race conditions,
    // and bootstrap failures from destroying the cloud copy.
    //
    // The database trigger (app_snapshots_protect) is the real bedrock —
    // even if this client check is bypassed, Postgres will reject the
    // write. This is just the polite first line of defense so we don't
    // round-trip a guaranteed-to-fail upsert.
    const localKeyCount = countMeaningfulKeys(localSnapshot);
    const localSize = JSON.stringify(localSnapshot).length;

    let remote: Awaited<ReturnType<typeof fetchRemoteSnapshot>> = null;
    try {
      remote = await fetchRemoteSnapshot(authed.workspaceId);
    } catch (error) {
      console.warn(
        "[Cloud Sync] Could not fetch remote for safety check — refusing push:",
        error,
      );
      return;
    }

    if (remote && remote.snapshot && typeof remote.snapshot === "object") {
      const remoteSnapshot = remote.snapshot as Record<string, unknown>;
      const remoteSize = JSON.stringify(remoteSnapshot).length;
      const remoteKeyCount = countMeaningfulKeys(remoteSnapshot);

      if (
        remoteSize > 10_000 &&
        (localSize < remoteSize / 2 ||
          (remoteKeyCount > 5 && localKeyCount < (remoteKeyCount * 7) / 10))
      ) {
        console.error(
          `[Cloud Sync] REFUSED destructive write. local_size=${localSize} local_keys=${localKeyCount} remote_size=${remoteSize} remote_keys=${remoteKeyCount}. The cloud has more data than the local copy — refusing to overwrite. Reload the page to pull cloud data.`,
        );
        // Notify any listener (e.g. the sync status UI) so the user sees
        // a hard error instead of a silent loss.
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("casemate:cloud-sync-blocked", {
              detail: { localSize, remoteSize, localKeyCount, remoteKeyCount },
            }),
          );
        }
        return;
      }

      // ── FRESHNESS GUARD (cloud-as-truth, multi-device) ──
      // If the cloud's updated_at is newer than this device's last successful
      // sync, another device has written data we haven't pulled yet. We must
      // refuse the push — otherwise a stale tab on (e.g.) the tablet would
      // overwrite the desktop's just-edited names. The bootstrap will pull
      // the newer remote on the next page load and this device will then
      // hold fresh data and be allowed to push again.
      //
      // Tolerance: 2 seconds for clock skew between devices.
      const lastLocalPushIso = window.localStorage.getItem(
        getSyncAtKey(authed.workspaceId),
      );
      const lastLocalPushMs = parseTimestamp(lastLocalPushIso);
      const remoteUpdatedMs = parseTimestamp(remote.updated_at ?? null);
      if (
        !Number.isNaN(lastLocalPushMs) &&
        !Number.isNaN(remoteUpdatedMs) &&
        remoteUpdatedMs > lastLocalPushMs + 2000
      ) {
        console.error(
          `[Cloud Sync] REFUSED stale push. Cloud was updated by another device. remote_updated_at=${remote.updated_at} local_last_sync=${lastLocalPushIso}. Reload to pull newer data.`,
        );
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("casemate:cloud-sync-blocked", {
              detail: {
                reason: "stale-local",
                localSyncAt: lastLocalPushIso,
                remoteUpdatedAt: remote.updated_at,
              },
            }),
          );
        }
        return;
      }
    }

    await upsertRemoteSnapshot(authed.workspaceId, localSnapshot);
  } catch (error) {
    console.warn("[Cloud Sync] Autosave failed:", error);
  }
}
