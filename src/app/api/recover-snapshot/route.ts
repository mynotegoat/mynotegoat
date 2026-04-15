import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Emergency data recovery endpoint.
 *
 * Uses the service role key to read app_snapshots, but ONLY after verifying
 * the caller is authenticated and the requested workspace belongs to them.
 *
 * History: an earlier version of this route accepted any workspaceId in the
 * body, then used service role to return snapshots across workspaces —
 * including the legacy pre-prefix "main-office" blob. That was an RLS bypass
 * for anyone who could hit the endpoint. We now require a bearer token,
 * reject requests where `workspaceId.split(":")[0] !== auth.uid()`, and only
 * return the caller's own workspace row (no cross-workspace merge).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { workspaceId?: string };
    const workspaceId = body?.workspaceId;

    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anonKey || !serviceKey) {
      return NextResponse.json(
        { error: "Server not configured for recovery" },
        { status: 500 },
      );
    }

    // Verify the caller. The browser must send the Supabase access token in
    // the Authorization header; we feed it to a scoped anon client so
    // `getUser()` resolves to the real authenticated user and nothing else.
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userResult, error: userError } = await userClient.auth.getUser();
    if (userError || !userResult?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = userResult.user.id;

    // The workspace id must be prefixed with the caller's auth user id.
    // Reject anything else, including the legacy bare "main-office" form —
    // that row (if it still exists) is from before per-user prefixes and
    // cannot be attributed to a specific user safely.
    const prefix = workspaceId.split(":")[0];
    if (prefix !== userId) {
      return NextResponse.json(
        { error: "Workspace does not belong to the authenticated user" },
        { status: 403 },
      );
    }

    const admin = createClient(url, serviceKey);

    // Fetch ONLY the caller's workspace snapshot. No cross-workspace merge.
    const { data: snapshotRow, error } = await admin
      .from("app_snapshots")
      .select("workspace_id, snapshot, updated_at")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!snapshotRow || !snapshotRow.snapshot) {
      return NextResponse.json(
        { error: "No snapshot found for this workspace" },
        { status: 404 },
      );
    }

    // Some older snapshots embed their own safety backup under the
    // `casemate.__safety-backup__.v1` key. Merge it in for any top-level
    // key that's missing or empty on the primary — still workspace-local,
    // no cross-workspace reads. This is the same pattern the client-side
    // "recover from safety backup" button uses.
    const merged = { ...(snapshotRow.snapshot as Record<string, unknown>) };
    const backupRaw = merged["casemate.__safety-backup__.v1"];
    if (backupRaw) {
      try {
        const backup = typeof backupRaw === "string" ? JSON.parse(backupRaw) : backupRaw;
        const backupSnap =
          backup && typeof backup === "object"
            ? (backup as { snapshot?: unknown }).snapshot
            : null;
        if (backupSnap && typeof backupSnap === "object") {
          for (const [key, value] of Object.entries(backupSnap as Record<string, unknown>)) {
            if (!key.startsWith("casemate.")) continue;
            if (key === "casemate.__safety-backup__.v1") continue;
            const existing = merged[key];
            if (
              existing === undefined ||
              existing === null ||
              existing === "" ||
              existing === "[]" ||
              existing === "{}"
            ) {
              merged[key] = value;
            }
          }
        }
      } catch {
        // ignore parse errors
      }
    }

    return NextResponse.json({
      snapshot: merged,
      updatedAt: snapshotRow.updated_at,
      source: "workspace",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
