"use client";

/**
 * KV Cloud — generic key-value cloud store for all remaining entities.
 *
 * Instead of 25 separate tables, one `workspace_kv` table stores every
 * config/settings/small-entity blob. The key column is the casemate.*
 * localStorage key, the value column is the full JSON payload.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { getActiveWorkspaceIdSync } from "@/lib/workspace-storage";

function getActiveWorkspaceOrNull(): string | null {
  const id = getActiveWorkspaceIdSync();
  return id || null;
}

/**
 * Fetch a single key's value from the kv table.
 * Returns the parsed JSON value, or null if missing/error.
 */
export async function fetchKvValue<T = unknown>(key: string): Promise<T | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const workspaceId = getActiveWorkspaceOrNull();
  if (!workspaceId) return null;

  const { data, error } = await supabase
    .from("workspace_kv")
    .select("value")
    .eq("workspace_id", workspaceId)
    .eq("key", key)
    .maybeSingle();

  if (error) {
    console.error(`[kv-cloud] fetch failed for key="${key}":`, error.message);
    return null;
  }
  if (!data) return null;
  return data.value as T;
}

/**
 * Fetch ALL kv rows for the active workspace. Used by the bootstrap to
 * pull everything in one round-trip.
 */
export async function fetchAllKvValues(): Promise<Map<string, unknown> | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const workspaceId = getActiveWorkspaceOrNull();
  if (!workspaceId) return null;

  const { data, error } = await supabase
    .from("workspace_kv")
    .select("key, value")
    .eq("workspace_id", workspaceId);

  if (error) {
    console.error("[kv-cloud] fetchAll failed:", error.message);
    return null;
  }

  const map = new Map<string, unknown>();
  for (const row of data ?? []) {
    map.set(row.key, row.value);
  }
  return map;
}

/**
 * Upsert a single key-value pair. Fire-and-forget from save functions.
 */
export async function upsertKvValue(key: string, value: unknown): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const workspaceId = getActiveWorkspaceOrNull();
  if (!workspaceId) return;

  const { error } = await supabase
    .from("workspace_kv")
    .upsert(
      { workspace_id: workspaceId, key, value },
      { onConflict: "workspace_id,key" },
    );

  if (error) {
    console.error(`[kv-cloud] upsert failed for key="${key}":`, error.message);
  }
}

/**
 * Bulk upsert multiple key-value pairs. Used by the bootstrap migration.
 */
export async function bulkUpsertKvValues(
  entries: Array<{ key: string; value: unknown }>,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, count: 0, error: "supabase not configured" };
  const workspaceId = getActiveWorkspaceOrNull();
  if (!workspaceId) return { ok: false, count: 0, error: "no active workspace" };

  if (entries.length === 0) return { ok: true, count: 0 };

  const rows = entries.map((e) => ({
    workspace_id: workspaceId,
    key: e.key,
    value: e.value,
  }));

  const { error } = await supabase
    .from("workspace_kv")
    .upsert(rows, { onConflict: "workspace_id,key" });

  if (error) {
    console.error("[kv-cloud] bulk upsert failed:", error.message);
    return { ok: false, count: 0, error: error.message };
  }
  return { ok: true, count: rows.length };
}

export async function isKvTableReady(): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return false;
  const workspaceId = getActiveWorkspaceOrNull();
  if (!workspaceId) return false;

  const { error } = await supabase
    .from("workspace_kv")
    .select("key", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .limit(1);

  if (error) {
    console.warn("[kv-cloud] table not ready:", error.message);
    return false;
  }
  return true;
}

/**
 * Generic dual-write helper. Call from any save function:
 *   void dualWriteKv("casemate.tasks.v1", "tasks", tasksArray);
 */
export async function dualWriteKv(
  storageKey: string,
  flagName: string,
  value: unknown,
): Promise<void> {
  try {
    const { isCloudEntityEnabled } = await import("@/lib/feature-flags");
    // Map storage keys to the correct flag name
    const flagMap: Record<string, string> = {
      billing: "billing",
      macros: "macros",
      schedulingSettings: "schedulingSettings",
      contacts: "contacts",
      tasks: "tasks",
    };
    const flag = flagMap[flagName] ?? flagName;
    if (!isCloudEntityEnabled(flag as import("@/lib/feature-flags").CloudEntityFlag)) return;
    await upsertKvValue(storageKey, value);
  } catch (error) {
    console.error(`[kv-cloud] dual-write failed for key="${storageKey}":`, error);
  }
}
