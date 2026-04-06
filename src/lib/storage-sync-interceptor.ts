"use client";

/**
 * Storage Sync Interceptor
 *
 * Monkey-patches localStorage.setItem and localStorage.removeItem so that
 * EVERY write to a casemate.* key automatically triggers an immediate
 * cloud push to Supabase. Debounced by 300ms to batch rapid changes.
 *
 * This means existing code does NOT need to change — any hook or function
 * that writes to localStorage automatically syncs to the cloud.
 *
 * Cloud is the source of truth. localStorage is just a fast cache.
 */

import { pushLocalStateToCloud } from "@/lib/cloud-state";

const CASEMATE_PREFIX = "casemate.";
const IGNORE_KEYS = new Set([
  "casemate.active-workspace-id.v1",
  "casemate.__safety-backup__.v1",
]);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let installed = false;
let pendingSync = false;
let lastSyncAt = 0;
let syncErrorCount = 0;
let paused = false;

/** Temporarily pause sync (e.g. during bootstrap writes). */
export function pauseSync() {
  paused = true;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

/** Resume sync after bootstrap. */
export function resumeSync() {
  paused = false;
}

// Sync status callback for UI indicator
type SyncStatusCallback = (status: "syncing" | "synced" | "error") => void;
let statusCallback: SyncStatusCallback | null = null;

export function onSyncStatusChange(callback: SyncStatusCallback) {
  statusCallback = callback;
}

function notifyStatus(status: "syncing" | "synced" | "error") {
  if (statusCallback) {
    try {
      statusCallback(status);
    } catch {
      // ignore
    }
  }
}

async function doSync() {
  if (pendingSync) {
    return;
  }
  pendingSync = true;
  notifyStatus("syncing");
  try {
    await pushLocalStateToCloud();
    lastSyncAt = Date.now();
    syncErrorCount = 0;
    notifyStatus("synced");
  } catch (error) {
    syncErrorCount += 1;
    console.error("[Storage Sync] Cloud push failed:", error);
    notifyStatus("error");
  } finally {
    pendingSync = false;
  }
}

function scheduleSyncNow() {
  if (paused) return;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    void doSync();
  }, 300);
}

export function installStorageSyncInterceptor() {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;

  const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
  const originalRemoveItem = window.localStorage.removeItem.bind(window.localStorage);

  window.localStorage.setItem = (key: string, value: string) => {
    originalSetItem(key, value);
    if (key.startsWith(CASEMATE_PREFIX) && !IGNORE_KEYS.has(key) && !key.startsWith("casemate.cloud-sync-at")) {
      scheduleSyncNow();
    }
  };

  window.localStorage.removeItem = (key: string) => {
    originalRemoveItem(key);
    if (key.startsWith(CASEMATE_PREFIX) && !IGNORE_KEYS.has(key) && !key.startsWith("casemate.cloud-sync-at")) {
      scheduleSyncNow();
    }
  };

  // Also do a sync on page hide/unload for safety
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void doSync();
    }
  });
  window.addEventListener("beforeunload", () => {
    void doSync();
  });
}

export function getLastSyncAt() {
  return lastSyncAt;
}

export function getSyncErrorCount() {
  return syncErrorCount;
}

export function forceSyncNow() {
  return doSync();
}
