"use client";

/**
 * Workspace-Namespaced Storage
 *
 * The Phase-0 foundation for cloud-as-truth migration.
 *
 * Every cache key written by the future `useCloudEntity` hook is namespaced
 * by the active workspace_id, so two different accounts signed into the same
 * browser physically cannot see each other's cached data.
 *
 * Key shape: `casemate.cache.v1.<workspaceId>.<entityName>`
 *
 * This module is INTENTIONALLY separate from the legacy `casemate.<entity>`
 * keys used by the existing JSONB-blob entity hooks. Phase 0 does NOT touch
 * those legacy keys — every existing entity keeps reading and writing the
 * blob exactly as it does today. Only NEW table-backed entities (Phase 1+)
 * will use this namespace.
 *
 * Hard rule: every read and write goes through `assertCorrectWorkspace()`
 * first. If the active workspace pointer in localStorage doesn't match what
 * the caller thinks the workspace is, we throw — better to crash loudly than
 * to silently leak data across accounts.
 */

const CACHE_PREFIX = "casemate.cache.v1.";
const ACTIVE_WORKSPACE_KEY = "casemate.active-workspace-id.v1";

export class WorkspaceMismatchError extends Error {
  constructor(
    public readonly expected: string,
    public readonly actual: string,
    public readonly entityName: string,
  ) {
    super(
      `Workspace mismatch reading "${entityName}": expected="${expected}" actual="${actual}". Refusing to read or write to prevent cross-account contamination.`,
    );
    this.name = "WorkspaceMismatchError";
  }
}

/** Read the workspace_id currently flagged as active in this browser. */
export function getActiveWorkspaceIdSync(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ACTIVE_WORKSPACE_KEY) ?? "";
}

/**
 * Throw if the active workspace pointer in localStorage does not match the
 * workspace the caller is operating under. Called by every read and write.
 *
 * This is the runtime backstop. If the higher-level auth state listener has
 * already wiped + re-bootstrapped on a user switch, this never fires. If
 * something slips through that net, this stops the read/write cold instead
 * of letting User A see User B's cached data.
 */
export function assertCorrectWorkspace(
  expectedWorkspaceId: string,
  entityName: string,
) {
  const active = getActiveWorkspaceIdSync();
  if (!active) {
    throw new WorkspaceMismatchError(expectedWorkspaceId, "<empty>", entityName);
  }
  if (active !== expectedWorkspaceId) {
    throw new WorkspaceMismatchError(expectedWorkspaceId, active, entityName);
  }
}

/** Build the namespaced cache key for an entity under a workspace. */
export function buildCacheKey(workspaceId: string, entityName: string): string {
  if (!workspaceId) throw new Error("buildCacheKey: workspaceId is required");
  if (!entityName) throw new Error("buildCacheKey: entityName is required");
  return `${CACHE_PREFIX}${workspaceId}.${entityName}`;
}

interface CacheEnvelope<T> {
  workspaceId: string;
  entityName: string;
  writtenAt: string;
  data: T;
}

/**
 * Read a workspace-scoped cache entry. Returns null if missing, malformed,
 * or tagged with a different workspace_id (defense in depth).
 */
export function readWorkspaceCache<T>(
  workspaceId: string,
  entityName: string,
): T | null {
  if (typeof window === "undefined") return null;
  assertCorrectWorkspace(workspaceId, entityName);
  try {
    const raw = window.localStorage.getItem(buildCacheKey(workspaceId, entityName));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed !== "object") return null;
    // Defense-in-depth: even if the localStorage key was somehow leaked
    // across workspaces, the envelope's stored workspace_id must match.
    if (parsed.workspaceId !== workspaceId) return null;
    if (parsed.entityName !== entityName) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * Write a workspace-scoped cache entry. The envelope tags the data with
 * the workspace_id, entity name, and timestamp so we can verify it on read.
 */
export function writeWorkspaceCache<T>(
  workspaceId: string,
  entityName: string,
  data: T,
): void {
  if (typeof window === "undefined") return;
  assertCorrectWorkspace(workspaceId, entityName);
  const envelope: CacheEnvelope<T> = {
    workspaceId,
    entityName,
    writtenAt: new Date().toISOString(),
    data,
  };
  window.localStorage.setItem(
    buildCacheKey(workspaceId, entityName),
    JSON.stringify(envelope),
  );
}

/** Remove a single cache entry. */
export function deleteWorkspaceCache(workspaceId: string, entityName: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(buildCacheKey(workspaceId, entityName));
}

/**
 * Wipe every `casemate.cache.v1.*` key from localStorage, regardless of
 * workspace. Called by sign-out and by the bootstrap when the active
 * workspace pointer is wrong.
 */
export function clearAllWorkspaceCaches(): void {
  if (typeof window === "undefined") return;
  const keysToRemove: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(CACHE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => window.localStorage.removeItem(key));
}

/**
 * Wipe every cache key NOT belonging to the given workspace. Called by the
 * bootstrap when the active workspace is confirmed, to evict any leftover
 * cache from a prior account that might still be sitting around.
 */
export function clearForeignWorkspaceCaches(currentWorkspaceId: string): void {
  if (typeof window === "undefined") return;
  if (!currentWorkspaceId) {
    clearAllWorkspaceCaches();
    return;
  }
  const expectedPrefix = `${CACHE_PREFIX}${currentWorkspaceId}.`;
  const keysToRemove: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(CACHE_PREFIX) && !key.startsWith(expectedPrefix)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => window.localStorage.removeItem(key));
}

/**
 * Diagnostic — list every cache key currently in localStorage, along with
 * its workspace prefix. Used by the Settings → Diagnostics self-check.
 */
export function listAllCacheEntries(): Array<{
  fullKey: string;
  workspaceId: string;
  entityName: string;
  sizeBytes: number;
}> {
  if (typeof window === "undefined") return [];
  const entries: Array<{
    fullKey: string;
    workspaceId: string;
    entityName: string;
    sizeBytes: number;
  }> = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(CACHE_PREFIX)) continue;
    const stripped = key.slice(CACHE_PREFIX.length);
    const dot = stripped.indexOf(".");
    if (dot === -1) continue;
    const workspaceId = stripped.slice(0, dot);
    const entityName = stripped.slice(dot + 1);
    const value = window.localStorage.getItem(key) ?? "";
    entries.push({
      fullKey: key,
      workspaceId,
      entityName,
      sizeBytes: value.length,
    });
  }
  return entries;
}
