"use client";

/**
 * Encounter Notes Cloud — Phase 3 table-backed CRUD.
 * SOAP sections, macro runs, diagnoses, and charges stored as JSONB.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { getActiveWorkspaceIdSync } from "@/lib/workspace-storage";
import type { EncounterNoteRecord } from "@/lib/encounter-notes";

interface EncounterNoteRow {
  id: string;
  workspace_id: string;
  patient_id: string;
  patient_name: string;
  provider: string;
  appointment_type: string;
  encounter_date: string;
  start_time: string;
  soap: Record<string, string>;
  macro_runs: unknown[];
  diagnoses: unknown[];
  charges: unknown[];
  signed: boolean;
  signed_at: string;
  created_at_record: string;
  updated_at_record: string;
}

function noteToRow(note: EncounterNoteRecord, workspaceId: string): EncounterNoteRow {
  return {
    id: note.id,
    workspace_id: workspaceId,
    patient_id: note.patientId ?? "",
    patient_name: note.patientName ?? "",
    provider: note.provider ?? "",
    appointment_type: note.appointmentType ?? "",
    encounter_date: note.encounterDate ?? "",
    start_time: note.startTime ?? "",
    soap: note.soap ?? { subjective: "", objective: "", assessment: "", plan: "" },
    macro_runs: note.macroRuns ?? [],
    diagnoses: note.diagnoses ?? [],
    charges: note.charges ?? [],
    signed: note.signed ?? false,
    signed_at: note.signedAt ?? "",
    created_at_record: note.createdAt ?? "",
    updated_at_record: note.updatedAt ?? "",
  };
}

function rowToNote(row: EncounterNoteRow): EncounterNoteRecord {
  const soap = (row.soap && typeof row.soap === "object")
    ? row.soap as Record<string, string>
    : { subjective: "", objective: "", assessment: "", plan: "" };
  return {
    id: row.id,
    patientId: row.patient_id ?? "",
    patientName: row.patient_name ?? "",
    provider: row.provider ?? "",
    appointmentType: row.appointment_type ?? "",
    encounterDate: row.encounter_date ?? "",
    startTime: row.start_time ?? "",
    soap: {
      subjective: soap.subjective ?? "",
      objective: soap.objective ?? "",
      assessment: soap.assessment ?? "",
      plan: soap.plan ?? "",
    },
    macroRuns: Array.isArray(row.macro_runs) ? row.macro_runs as EncounterNoteRecord["macroRuns"] : [],
    diagnoses: Array.isArray(row.diagnoses) ? row.diagnoses as EncounterNoteRecord["diagnoses"] : [],
    charges: Array.isArray(row.charges) ? row.charges as EncounterNoteRecord["charges"] : [],
    signed: row.signed ?? false,
    signedAt: row.signed_at ?? "",
    createdAt: row.created_at_record ?? "",
    updatedAt: row.updated_at_record ?? "",
  };
}

function getActiveWorkspaceOrNull(): string | null {
  const id = getActiveWorkspaceIdSync();
  return id || null;
}

export async function fetchAllEncounterNotesFromTable(): Promise<EncounterNoteRecord[] | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const workspaceId = getActiveWorkspaceOrNull();
  if (!workspaceId) return null;

  const { data, error } = await supabase
    .from("encounter_notes")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (error) {
    console.error("[encounter-notes-cloud] fetchAll failed:", error.message);
    return null;
  }
  return ((data ?? []) as EncounterNoteRow[]).map(rowToNote);
}

export async function bulkUpsertEncounterNotesToTable(
  notes: EncounterNoteRecord[],
): Promise<{ ok: boolean; count: number; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, count: 0, error: "supabase not configured" };
  const workspaceId = getActiveWorkspaceOrNull();
  if (!workspaceId) return { ok: false, count: 0, error: "no active workspace" };

  if (notes.length === 0) return { ok: true, count: 0 };

  const rows = notes.map((n) => noteToRow(n, workspaceId));
  const { error } = await supabase
    .from("encounter_notes")
    .upsert(rows, { onConflict: "workspace_id,id" });

  if (error) {
    console.error("[encounter-notes-cloud] bulk upsert failed:", error.message);
    return { ok: false, count: 0, error: error.message };
  }
  return { ok: true, count: rows.length };
}

export async function upsertEncounterNoteToTable(note: EncounterNoteRecord): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const workspaceId = getActiveWorkspaceOrNull();
  if (!workspaceId) return;

  const row = noteToRow(note, workspaceId);
  const { error } = await supabase
    .from("encounter_notes")
    .upsert(row, { onConflict: "workspace_id,id" });

  if (error) {
    console.error("[encounter-notes-cloud] upsert failed:", error.message, "id:", note.id);
  }
}

export async function deleteEncounterNoteFromTable(noteId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const workspaceId = getActiveWorkspaceOrNull();
  if (!workspaceId) return;

  const { error } = await supabase
    .from("encounter_notes")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", noteId);

  if (error) {
    console.error("[encounter-notes-cloud] delete failed:", error.message, "id:", noteId);
  }
}

export async function isEncounterNotesTableReady(): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return false;
  const workspaceId = getActiveWorkspaceOrNull();
  if (!workspaceId) return false;

  const { error } = await supabase
    .from("encounter_notes")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .limit(1);

  if (error) {
    console.warn("[encounter-notes-cloud] table not ready:", error.message);
    return false;
  }
  return true;
}
