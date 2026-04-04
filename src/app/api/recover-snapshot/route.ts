import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Emergency data recovery endpoint.
 * Uses the service role key to bypass RLS and fetch ALL available snapshots,
 * merges them (user workspace + legacy), and returns the most complete data.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { workspaceId?: string };
    const workspaceId = body?.workspaceId;

    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      return NextResponse.json({ error: "Server not configured for recovery" }, { status: 500 });
    }

    const supabase = createClient(url, serviceKey);

    // Fetch ALL snapshots to merge
    const { data: allSnapshots, error } = await supabase
      .from("app_snapshots")
      .select("workspace_id, snapshot, updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!allSnapshots || allSnapshots.length === 0) {
      return NextResponse.json({ error: "No snapshots found" }, { status: 404 });
    }

    // Find the user's workspace snapshot and legacy snapshot
    const userSnapshot = allSnapshots.find((s) => s.workspace_id === workspaceId);
    const legacySnapshot = allSnapshots.find((s) => s.workspace_id === "main-office");

    // Start with the best available snapshot
    const primary = userSnapshot || legacySnapshot;
    if (!primary || !primary.snapshot) {
      return NextResponse.json({ error: "No snapshot data found" }, { status: 404 });
    }

    const merged = { ...(primary.snapshot as Record<string, unknown>) };

    // If we have a legacy snapshot too, merge any keys that are missing or empty
    // in the primary but exist in legacy
    if (legacySnapshot && legacySnapshot.snapshot && legacySnapshot.workspace_id !== primary.workspace_id) {
      const legacy = legacySnapshot.snapshot as Record<string, unknown>;
      for (const [key, value] of Object.entries(legacy)) {
        if (!key.startsWith("casemate.")) continue;
        if (key === "casemate.__safety-backup__.v1") continue;
        if (key === "casemate.active-workspace-id.v1") continue;

        const existing = merged[key];
        // If key doesn't exist in primary, or is empty, use legacy value
        if (existing === undefined || existing === null || existing === "" || existing === "[]" || existing === "{}") {
          merged[key] = value;
        }
      }
    }

    // Also check the safety backup inside any snapshot for additional data
    for (const snap of allSnapshots) {
      if (!snap.snapshot || typeof snap.snapshot !== "object") continue;
      const snapData = snap.snapshot as Record<string, unknown>;
      const backupRaw = snapData["casemate.__safety-backup__.v1"];
      if (!backupRaw) continue;
      try {
        const backup = typeof backupRaw === "string" ? JSON.parse(backupRaw) : backupRaw;
        if (backup && backup.snapshot && typeof backup.snapshot === "object") {
          const backupSnap = backup.snapshot as Record<string, unknown>;
          for (const [key, value] of Object.entries(backupSnap)) {
            if (!key.startsWith("casemate.")) continue;
            if (key === "casemate.__safety-backup__.v1") continue;
            const existing = merged[key];
            if (existing === undefined || existing === null || existing === "" || existing === "[]" || existing === "{}") {
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
      updatedAt: primary.updated_at,
      source: userSnapshot ? "merged" : "legacy",
      snapshotCount: allSnapshots.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
