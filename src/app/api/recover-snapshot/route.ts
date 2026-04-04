import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Emergency data recovery endpoint.
 * Uses the service role key to bypass RLS and fetch the user's cloud snapshot
 * so the client can write it directly to localStorage.
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

    // Try the user-specific workspace first
    const { data, error } = await supabase
      .from("app_snapshots")
      .select("workspace_id, snapshot, updated_at")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || !data.snapshot) {
      // Try the legacy "main-office" workspace as fallback
      const { data: legacyData, error: legacyError } = await supabase
        .from("app_snapshots")
        .select("workspace_id, snapshot, updated_at")
        .eq("workspace_id", "main-office")
        .maybeSingle();

      if (legacyError || !legacyData || !legacyData.snapshot) {
        return NextResponse.json({ error: "No snapshot found" }, { status: 404 });
      }

      return NextResponse.json({
        snapshot: legacyData.snapshot,
        updatedAt: legacyData.updated_at,
        source: "legacy",
      });
    }

    return NextResponse.json({
      snapshot: data.snapshot,
      updatedAt: data.updated_at,
      source: "user-workspace",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
