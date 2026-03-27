export interface PatientDiagnosisEntry {
  id: string;
  code: string;
  description: string;
  source: string;
  createdAt: string;
}

type PatientDiagnosisMap = Record<string, PatientDiagnosisEntry[]>;

const STORAGE_KEY = "casemate.patient-diagnoses.v1";

function normalizeEntry(value: unknown): PatientDiagnosisEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Partial<PatientDiagnosisEntry>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const code = typeof row.code === "string" ? row.code.trim().toUpperCase() : "";
  const description = typeof row.description === "string" ? row.description.trim() : "";
  const source = typeof row.source === "string" ? row.source.trim() : "";
  const createdAt = typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString();
  if (!id || !code || !description) {
    return null;
  }
  return {
    id,
    code,
    description,
    source: source || "Manual",
    createdAt,
  };
}

export function loadPatientDiagnosesMap(): PatientDiagnosisMap {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const map: PatientDiagnosisMap = {};
    Object.entries(parsed).forEach(([patientId, entries]) => {
      if (!Array.isArray(entries)) {
        return;
      }
      const normalized = entries.map(normalizeEntry).filter((entry): entry is PatientDiagnosisEntry => Boolean(entry));
      map[patientId] = normalized;
    });
    return map;
  } catch {
    return {};
  }
}

export function savePatientDiagnosesMap(value: PatientDiagnosisMap) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

