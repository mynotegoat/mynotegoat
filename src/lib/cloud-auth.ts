"use client";

/**
 * Shared cloud-auth helpers.
 *
 * Every *-cloud.ts module used to have its own copy of a
 * `resolveValidatedWorkspaceId()` function that called
 * `supabase.auth.getUser()` on every upsert/delete. When a user triggers
 * a lot of cloud writes in quick succession (Consolidate Attorneys, a
 * bulk patient edit, the schedule-settings bootstrap, etc.) those calls
 * fight for the `navigator.locks` auth lock that supabase-js holds for
 * `getUser()` and one of them eventually loses with
 *     AbortError: Lock broken by another request with the 'steal' option.
 *
 * This module centralizes two defenses so every cloud module gets them:
 *
 *   1. Cross-module in-flight Promise dedupe — concurrent callers (even
 *      from different *-cloud modules) share ONE round-trip to
 *      supabase.auth.getUser() instead of racing.
 *   2. Short-lived validation cache (5s) — subsequent writes inside a
 *      burst reuse the validated workspaceId without re-calling getUser().
 *   3. Lock-steal retry helper — the auth lock can still be contested
 *      across tabs; any op that hit the transient AbortError retries
 *      exactly once after invalidating the cache.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { getActiveWorkspaceIdSync } from "@/lib/workspace-storage";

const WORKSPACE_VALIDATION_TTL_MS = 5000;

let cachedValidation: { workspaceId: string; expiresAt: number } | null = null;
let inFlightValidation: Promise<string> | null = null;

/** Drop the cached workspace validation. Called after a lock-steal retry
 *  and exported so auth state-change handlers can force a refresh on
 *  sign-out / account switch. */
export function invalidateCloudAuthCache() {
  cachedValidation = null;
  inFlightValidation = null;
}

function getActiveWorkspaceOrNull(): string | null {
  const id = getActiveWorkspaceIdSync();
  return id || null;
}

/**
 * Resolve + validate the workspace_id for the current auth session. Prefix
 * the error messages with a caller-specific tag (e.g. "[patients-cloud]")
 * so the error log still tells you WHICH table the write was against.
 */
export async function resolveValidatedWorkspaceId(
  logPrefix: string,
  source: string,
): Promise<string> {
  if (cachedValidation && cachedValidation.expiresAt > Date.now()) {
    return cachedValidation.workspaceId;
  }
  if (inFlightValidation) {
    return inFlightValidation;
  }

  inFlightValidation = (async () => {
    const workspaceId = getActiveWorkspaceOrNull();
    if (!workspaceId) {
      throw new Error(`${logPrefix} ${source}: no active workspace id in localStorage`);
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      throw new Error(`${logPrefix} ${source}: supabase client not configured`);
    }
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      throw new Error(`${logPrefix} ${source}: auth.getUser failed: ${error.message}`);
    }
    const userId = data.user?.id;
    if (!userId) {
      throw new Error(`${logPrefix} ${source}: no authenticated user`);
    }
    const prefix = workspaceId.split(":")[0];
    if (prefix !== userId) {
      throw new Error(
        `${logPrefix} ${source}: workspace/user mismatch — ` +
          `workspace_id prefix="${prefix}" does not match auth.uid="${userId}". ` +
          `Refusing to write (would be silently rejected by RLS).`,
      );
    }
    cachedValidation = {
      workspaceId,
      expiresAt: Date.now() + WORKSPACE_VALIDATION_TTL_MS,
    };
    return workspaceId;
  })();

  try {
    return await inFlightValidation;
  } finally {
    inFlightValidation = null;
  }
}

function isLockStealError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("Lock broken by another request with the 'steal' option")) {
    return true;
  }
  if (err instanceof Error && err.name === "AbortError" && message.includes("Lock")) {
    return true;
  }
  return false;
}

/**
 * Wrap a Supabase operation so that a transient lock-steal error triggers
 * exactly one retry (after clearing the cached validation). Any other
 * error propagates unchanged. One retry is enough in practice because the
 * contesting lock holder releases the moment its own op finishes.
 */
export async function withLockStealRetry<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (!isLockStealError(err)) throw err;
    invalidateCloudAuthCache();
    return await op();
  }
}
