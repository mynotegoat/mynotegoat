"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type LocalSnapshot = Record<string, string>;

const LOCAL_KEY_PREFIX = "casemate.";
const LOCAL_SYNC_AT_KEY = "casemate.cloud-sync-at.v1";
const DEFAULT_TABLE = "app_snapshots";
const DEFAULT_WORKSPACE_ID = "default";

let client: SupabaseClient | null = null;

function getConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const table =
    process.env.NEXT_PUBLIC_CASEMATE_SNAPSHOT_TABLE?.trim() || DEFAULT_TABLE;
  const workspaceId =
    process.env.NEXT_PUBLIC_CASEMATE_WORKSPACE_ID?.trim() || DEFAULT_WORKSPACE_ID;

  if (!url || !anonKey) {
    return null;
  }

  return {
    url,
    anonKey,
    table,
    workspaceId,
  };
}

function getClient() {
  const config = getConfig();
  if (!config) {
    return null;
  }

  if (!client) {
    client = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return client;
}

export function isCloudSyncEnabled() {
  return Boolean(getConfig());
}

function readLocalSnapshot(): LocalSnapshot {
  if (typeof window === "undefined") {
    return {};
  }

  const snapshot: LocalSnapshot = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(LOCAL_KEY_PREFIX) || key === LOCAL_SYNC_AT_KEY) {
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

async function fetchRemoteSnapshot() {
  const config = getConfig();
  const supabase = getClient();
  if (!config || !supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from(config.table)
    .select("workspace_id,snapshot,updated_at")
    .eq("workspace_id", config.workspaceId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function upsertRemoteSnapshot(snapshot: LocalSnapshot) {
  const config = getConfig();
  const supabase = getClient();
  if (!config || !supabase) {
    return;
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase.from(config.table).upsert(
    {
      workspace_id: config.workspaceId,
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

  window.localStorage.setItem(LOCAL_SYNC_AT_KEY, nowIso);
}

export async function prepareCloudStateBeforeMount() {
  if (typeof window === "undefined" || !isCloudSyncEnabled()) {
    return;
  }

  try {
    const localSnapshot = readLocalSnapshot();
    const localHasData = hasMeaningfulLocalData(localSnapshot);
    const localSyncedAtMs = parseTimestamp(
      window.localStorage.getItem(LOCAL_SYNC_AT_KEY),
    );

    const remote = await fetchRemoteSnapshot();

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
          window.localStorage.setItem(LOCAL_SYNC_AT_KEY, remote.updated_at);
        }
        return;
      }
    }

    if (localHasData) {
      await upsertRemoteSnapshot(localSnapshot);
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
    const localSnapshot = readLocalSnapshot();
    if (!hasMeaningfulLocalData(localSnapshot)) {
      return;
    }
    await upsertRemoteSnapshot(localSnapshot);
  } catch (error) {
    console.warn("[Cloud Sync] Autosave failed:", error);
  }
}
