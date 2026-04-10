export interface PatientBillingAdjustment {
  id: string;
  label: string;
  amount: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface PatientBillingRecord {
  patientId: string;
  billedAmount: number;
  paidAmount: number;
  paidDate: string;
  adjustments: PatientBillingAdjustment[];
  createdAt: string;
  updatedAt: string;
}

export type PatientBillingMap = Record<string, PatientBillingRecord>;

const STORAGE_KEY = "casemate.patient-billing.v1";

function nowIso() {
  return new Date().toISOString();
}

function normalizeMoney(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }
  return 0;
}

function toUsDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(trimmed)) {
    const [month, day, year] = trimmed.split("/");
    return `${month}/${day}/20${year}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-");
    return `${month}/${day}/${year}`;
  }
  return "";
}

function normalizeAdjustment(value: unknown): PatientBillingAdjustment | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Partial<PatientBillingAdjustment>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const label = typeof row.label === "string" ? row.label.trim() : "";
  if (!id || !label) {
    return null;
  }
  return {
    id,
    label,
    amount: normalizeMoney(row.amount),
    note: typeof row.note === "string" ? row.note : "",
    createdAt: typeof row.createdAt === "string" ? row.createdAt : nowIso(),
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : nowIso(),
  };
}

function normalizeRecord(value: unknown): PatientBillingRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Partial<PatientBillingRecord>;
  const patientId = typeof row.patientId === "string" ? row.patientId.trim() : "";
  if (!patientId) {
    return null;
  }

  return {
    patientId,
    billedAmount: normalizeMoney(row.billedAmount),
    paidAmount: normalizeMoney(row.paidAmount),
    paidDate: typeof row.paidDate === "string" ? toUsDate(row.paidDate) : "",
    adjustments: Array.isArray(row.adjustments)
      ? row.adjustments
          .map(normalizeAdjustment)
          .filter((entry): entry is PatientBillingAdjustment => Boolean(entry))
      : [],
    createdAt: typeof row.createdAt === "string" ? row.createdAt : nowIso(),
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : nowIso(),
  };
}

export function createPatientBillingRecord(patientId: string): PatientBillingRecord {
  const timestamp = nowIso();
  return {
    patientId,
    billedAmount: 0,
    paidAmount: 0,
    paidDate: "",
    adjustments: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function loadPatientBillingMap(): PatientBillingMap {
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
    const map: PatientBillingMap = {};
    Object.entries(parsed).forEach(([patientId, entry]) => {
      const normalized = normalizeRecord(entry);
      if (!normalized) {
        return;
      }
      map[patientId] = normalized;
    });
    return map;
  } catch {
    return {};
  }
}

export function savePatientBillingMap(value: PatientBillingMap) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  void import("@/lib/kv-cloud").then((m) => m.dualWriteKv(STORAGE_KEY, "billing", value));
}
