"use client";

/**
 * Patients Cloud — table-backed CRUD for the patients entity.
 *
 * Phase-1 of the cloud-as-truth migration. This module owns the round-trip
 * between in-memory `PatientRecord` objects and the `patients` Postgres table.
 * Every function here is workspace-scoped: nothing can read or write a row
 * for a workspace other than the one currently active in this browser.
 *
 * Read path:  fetchAllPatientsFromTable() → PatientRecord[]
 * Write path: upsertPatientToTable(patient)
 * Delete:     deletePatientFromTable(id)
 * Bulk:       bulkUpsertPatientsToTable(patients)  — used by the one-time
 *             blob → table migration on first flag flip.
 *
 * The legacy module-scoped `patients` array in mock-data.ts continues to be
 * the in-memory cache. When the `patients` feature flag is on, every
 * persistPatients/deletePatientRecord call also pushes to the table, and
 * the bootstrap replaces the cache from the table BEFORE the patients page
 * mounts.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { getActiveWorkspaceIdSync } from "@/lib/workspace-storage";
import type {
  CaseStatus,
  PatientMatrixField,
  PatientPriority,
  PatientRecord,
} from "@/lib/mock-data";

interface PatientRow {
  id: string;
  workspace_id: string;
  full_name: string;
  dob: string;
  sex: string | null;
  marital_status: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  attorney: string;
  case_status: string;
  date_of_loss: string;
  last_update: string;
  priority: string;
  matrix: Record<string, string> | null;
  related_cases: PatientRecord["relatedCases"] | null;
  xray_referrals: unknown[] | null;
  mri_referrals: unknown[] | null;
  specialist_referrals: unknown[] | null;
  alerts: string[] | null;
  created_at?: string;
  updated_at?: string;
}

function patientToRow(patient: PatientRecord, workspaceId: string): PatientRow {
  return {
    id: patient.id,
    workspace_id: workspaceId,
    full_name: patient.fullName ?? "",
    dob: patient.dob ?? "",
    sex: patient.sex ?? null,
    marital_status: patient.maritalStatus ?? null,
    phone: patient.phone ?? "",
    email: patient.email ?? null,
    address: patient.address ?? null,
    attorney: patient.attorney ?? "",
    case_status: patient.caseStatus ?? "Active",
    date_of_loss: patient.dateOfLoss ?? "",
    last_update: patient.lastUpdate ?? "",
    priority: patient.priority ?? "Normal",
    matrix: patient.matrix ? (patient.matrix as Record<string, string>) : null,
    related_cases: patient.relatedCases ?? null,
    xray_referrals: (patient.xrayReferrals as unknown[] | undefined) ?? null,
    mri_referrals: (patient.mriReferrals as unknown[] | undefined) ?? null,
    specialist_referrals: (patient.specialistReferrals as unknown[] | undefined) ?? null,
    alerts: patient.alerts ?? null,
  };
}

function rowToPatient(row: PatientRow): PatientRecord {
  return {
    id: row.id,
    fullName: row.full_name ?? "",
    dob: row.dob ?? "",
    sex: (row.sex as PatientRecord["sex"]) ?? undefined,
    maritalStatus: (row.marital_status as PatientRecord["maritalStatus"]) ?? undefined,
    phone: row.phone ?? "",
    email: row.email ?? undefined,
    address: row.address ?? undefined,
    attorney: row.attorney ?? "",
    caseStatus: (row.case_status as CaseStatus) ?? "Active",
    dateOfLoss: row.date_of_loss ?? "",
    lastUpdate: row.last_update ?? "",
    priority: (row.priority as PatientPriority) ?? "Normal",
    matrix: row.matrix
      ? (row.matrix as Partial<Record<PatientMatrixField, string>>)
      : undefined,
    relatedCases: row.related_cases ?? undefined,
    xrayReferrals: row.xray_referrals ?? undefined,
    mriReferrals: row.mri_referrals ?? undefined,
    specialistReferrals: row.specialist_referrals ?? undefined,
    alerts: row.alerts ?? undefined,
  };
}

function getActiveWorkspaceOrNull(): string | null {
  const id = getActiveWorkspaceIdSync();
  return id || null;
}

/**
 * Fetch every patient row for the active workspace. Returns null if Supabase
 * isn't configured, the user isn't signed in, or the table doesn't exist yet
 * (e.g. user hasn't run the SQL migration). Callers must treat null as "fall
 * back to the legacy blob source" rather than "empty list".
 */
export async function fetchAllPatientsFromTable(): Promise<PatientRecord[] | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const workspaceId = getActiveWorkspaceOrNull();
  if (!workspaceId) return null;

  const { data, error } = await supabase
    .from("patients")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (error) {
    console.error("[patients-cloud] fetchAll failed:", error.message);
    return null;
  }
  return ((data ?? []) as PatientRow[]).map(rowToPatient);
}

/**
 * Upsert a single patient. Fire-and-forget — caller does NOT await.
 * Errors are logged but never thrown so a cloud hiccup can't take down a
 * local edit. The legacy blob write still runs synchronously alongside.
 */
export async function upsertPatientToTable(patient: PatientRecord): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const workspaceId = getActiveWorkspaceOrNull();
  if (!workspaceId) return;

  const row = patientToRow(patient, workspaceId);
  const { error } = await supabase
    .from("patients")
    .upsert(row, { onConflict: "workspace_id,id" });

  if (error) {
    console.error("[patients-cloud] upsert failed:", error.message, "patient:", patient.id);
  }
}

export async function bulkUpsertPatientsToTable(patientsList: PatientRecord[]): Promise<{
  ok: boolean;
  count: number;
  error?: string;
}> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, count: 0, error: "supabase not configured" };
  const workspaceId = getActiveWorkspaceOrNull();
  if (!workspaceId) return { ok: false, count: 0, error: "no active workspace" };

  if (patientsList.length === 0) {
    return { ok: true, count: 0 };
  }

  const rows = patientsList.map((p) => patientToRow(p, workspaceId));
  const { error } = await supabase
    .from("patients")
    .upsert(rows, { onConflict: "workspace_id,id" });

  if (error) {
    console.error("[patients-cloud] bulk upsert failed:", error.message);
    return { ok: false, count: 0, error: error.message };
  }
  return { ok: true, count: rows.length };
}

export async function deletePatientFromTable(patientId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const workspaceId = getActiveWorkspaceOrNull();
  if (!workspaceId) return;

  const { error } = await supabase
    .from("patients")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", patientId);

  if (error) {
    console.error("[patients-cloud] delete failed:", error.message, "patient:", patientId);
  }
}

/**
 * Whether the patients table exists and is reachable for the active workspace.
 * Used by the bootstrap to decide whether the table is ready to be the read
 * source. A `relation does not exist` error means the user hasn't run the
 * SQL migration — we surface that gracefully instead of crashing.
 */
export async function isPatientsTableReady(): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return false;
  const workspaceId = getActiveWorkspaceOrNull();
  if (!workspaceId) return false;

  const { error } = await supabase
    .from("patients")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .limit(1);

  if (error) {
    console.warn("[patients-cloud] table not ready:", error.message);
    return false;
  }
  return true;
}
