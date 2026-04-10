import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/admin/migrate-casemate
 *
 * Two modes:
 *   mode: "preview"  — fetches existing patients for the workspace, compares
 *                       by name+DOL, returns new vs duplicate lists.
 *   mode: "execute"  — inserts only the non-duplicate patients + contacts.
 *
 * Only callable by admins.
 */

function dedupeKey(name: string, dateOfLoss: string): string {
  return `${(name || "").trim().toLowerCase()}||${(dateOfLoss || "").trim()}`;
}

async function verifyAdmin(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return { error: "Supabase config missing", status: 500 };

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return { error: "Unauthorized", status: 401 };

  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };

  const admin = getSupabaseAdminClient();
  if (!admin) return { error: "Service role key not configured", status: 500 };

  const { data: account } = await admin
    .from("accounts")
    .select("is_admin")
    .eq("user_id", user.id)
    .single();
  if (!account?.is_admin) return { error: "Admin only", status: 403 };

  return { admin };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { workspaceId, patients, contacts, mode = "execute" } = body;

    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    const auth = await verifyAdmin(request);
    if ("error" in auth) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }
    const admin = auth.admin;

    // Fetch existing patients for this workspace
    const { data: existingRows } = await admin
      .from("patients")
      .select("id, full_name, date_of_loss")
      .eq("workspace_id", workspaceId);

    const existingKeys = new Set<string>();
    (existingRows ?? []).forEach((row: { full_name: string; date_of_loss: string }) => {
      existingKeys.add(dedupeKey(row.full_name, row.date_of_loss));
    });

    // Split incoming patients into new vs duplicate
    const incoming = Array.isArray(patients) ? patients : [];
    const newPatients: Record<string, unknown>[] = [];
    const duplicates: { full_name: string; date_of_loss: string }[] = [];

    incoming.forEach((p: Record<string, unknown>) => {
      const key = dedupeKey(
        (p.full_name as string) ?? "",
        (p.date_of_loss as string) ?? ""
      );
      if (existingKeys.has(key)) {
        duplicates.push({
          full_name: (p.full_name as string) ?? "",
          date_of_loss: (p.date_of_loss as string) ?? "",
        });
      } else {
        newPatients.push(p);
      }
    });

    // Also check for existing contacts
    const { data: existingKv } = await admin
      .from("workspace_kv")
      .select("value")
      .eq("workspace_id", workspaceId)
      .eq("key", "casemate.contact-directory.v1")
      .single();

    const existingContacts: { name: string }[] = Array.isArray(existingKv?.value)
      ? existingKv.value
      : [];
    const existingContactNames = new Set(
      existingContacts.map((c) => (c.name || "").trim().toLowerCase())
    );

    const incomingContacts = Array.isArray(contacts) ? contacts : [];
    const newContacts = incomingContacts.filter(
      (c: Record<string, unknown>) =>
        !existingContactNames.has(((c.name as string) || "").trim().toLowerCase())
    );
    const duplicateContacts = incomingContacts.filter(
      (c: Record<string, unknown>) =>
        existingContactNames.has(((c.name as string) || "").trim().toLowerCase())
    );

    // ---- PREVIEW MODE ----
    if (mode === "preview") {
      return NextResponse.json({
        newCount: newPatients.length,
        duplicateCount: duplicates.length,
        duplicates,
        newContactCount: newContacts.length,
        duplicateContactCount: duplicateContacts.length,
        existingCount: existingRows?.length ?? 0,
        existingContactCount: existingContacts.length,
      });
    }

    // ---- EXECUTE MODE ----
    const results = {
      patientsInserted: 0,
      patientsSkipped: duplicates.length,
      contactsInserted: 0,
      contactsSkipped: duplicateContacts.length,
      errors: [] as string[],
    };

    if (newPatients.length > 0) {
      const rows = newPatients.map((p) => ({
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

    // Merge new contacts with existing
    if (newContacts.length > 0) {
      const merged = [...existingContacts, ...newContacts];
      const { error } = await admin.from("workspace_kv").upsert(
        {
          workspace_id: workspaceId,
          key: "casemate.contact-directory.v1",
          value: merged,
        },
        { onConflict: "workspace_id,key" }
      );
      if (error) {
        results.errors.push(`Contacts: ${error.message}`);
      } else {
        results.contactsInserted = newContacts.length;
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
