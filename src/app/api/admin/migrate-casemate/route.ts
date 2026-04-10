import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/admin/migrate-casemate
 *
 * Accepts a workspace_id + arrays of mapped patients and contacts from the
 * old Casemate system and inserts them into the Supabase tables using the
 * service role key (bypasses RLS).
 *
 * Only callable by admins — the admin layout already gates access, and we
 * verify the caller is authenticated + admin here too.
 */
export async function POST(request: Request) {
  try {
    const { workspaceId, patients, contacts } = await request.json();

    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // Verify the caller is an authenticated admin
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!url || !anonKey) {
      return NextResponse.json(
        { error: "Supabase config missing" },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin status
    const admin = getSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Service role key not configured" },
        { status: 500 }
      );
    }

    const { data: account } = await admin
      .from("accounts")
      .select("is_admin")
      .eq("user_id", user.id)
      .single();
    if (!account?.is_admin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const results = { patientsInserted: 0, contactsInserted: 0, errors: [] as string[] };

    // Insert patients in batches
    if (Array.isArray(patients) && patients.length > 0) {
      const rows = patients.map((p: Record<string, unknown>) => ({
        id: p.id,
        workspace_id: workspaceId,
        full_name: p.full_name ?? "",
        dob: p.dob ?? "",
        sex: p.sex ?? null,
        marital_status: p.marital_status ?? null,
        phone: p.phone ?? "",
        email: p.email ?? null,
        address: p.address ?? null,
        attorney: p.attorney ?? "",
        case_status: p.case_status ?? "Active",
        date_of_loss: p.date_of_loss ?? "",
        last_update: p.last_update ?? "",
        priority: p.priority ?? "Normal",
        matrix: p.matrix ?? null,
        related_cases: p.related_cases ?? null,
        xray_referrals: p.xray_referrals ?? null,
        mri_referrals: p.mri_referrals ?? null,
        specialist_referrals: p.specialist_referrals ?? null,
        alerts: p.alerts ?? null,
      }));

      // Batch upsert in chunks of 50
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { error } = await admin
          .from("patients")
          .upsert(batch, { onConflict: "workspace_id,id" });
        if (error) {
          results.errors.push(`Patients batch ${i}: ${error.message}`);
        } else {
          results.patientsInserted += batch.length;
        }
      }
    }

    // Insert contacts as a workspace_kv entry
    if (Array.isArray(contacts) && contacts.length > 0) {
      const { error } = await admin.from("workspace_kv").upsert(
        {
          workspace_id: workspaceId,
          key: "casemate.contact-directory.v1",
          value: contacts,
        },
        { onConflict: "workspace_id,key" }
      );
      if (error) {
        results.errors.push(`Contacts: ${error.message}`);
      } else {
        results.contactsInserted = contacts.length;
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
