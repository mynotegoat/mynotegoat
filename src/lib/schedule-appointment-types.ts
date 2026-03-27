export interface AppointmentTypeConfig {
  id: string;
  name: string;
  color: string;
  durationMin: number;
  isDefault: boolean;
}

const STORAGE_KEY = "casemate.schedule-appointment-types.v1";

const defaultAppointmentTypes: Omit<AppointmentTypeConfig, "id">[] = [
  { name: "Personal Injury Office Visit", color: "#ef7984", durationMin: 45, isDefault: true },
  { name: "Personal Injury New Patient", color: "#e4e64a", durationMin: 60, isDefault: false },
  { name: "Personal Injury Re-Exam", color: "#f39a1f", durationMin: 60, isDefault: false },
  { name: "Personal Injury Discharge Visit", color: "#c93b1d", durationMin: 60, isDefault: false },
  { name: "Spinal Decompression - C/S", color: "#73b4e4", durationMin: 30, isDefault: false },
  { name: "Spinal Decompression - L/S", color: "#1f66e5", durationMin: 30, isDefault: false },
  { name: "Cash New Patient", color: "#5b862b", durationMin: 50, isDefault: false },
  { name: "Cash Office Visit", color: "#84cd15", durationMin: 30, isDefault: false },
];

function createTypeId(prefix = "apt-type") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeColor(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }
  const candidate = value.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(candidate)) {
    return fallback;
  }
  return candidate.toLowerCase();
}

function normalizeDuration(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(5, Math.min(720, Math.round(value)));
}

function normalizeType(row: Partial<AppointmentTypeConfig>, index: number): AppointmentTypeConfig | null {
  const fallback = defaultAppointmentTypes[index % defaultAppointmentTypes.length] ?? defaultAppointmentTypes[0];
  const name = normalizeText(row.name);
  if (!name) {
    return null;
  }
  const id = normalizeText(row.id) || createTypeId();
  return {
    id,
    name,
    color: normalizeColor(row.color, fallback.color),
    durationMin: normalizeDuration(row.durationMin, fallback.durationMin),
    isDefault: Boolean(row.isDefault),
  };
}

function ensureSingleDefault(types: AppointmentTypeConfig[]) {
  if (!types.length) {
    return types;
  }

  let hasDefault = false;
  return types.map((type, index) => {
    if (type.isDefault && !hasDefault) {
      hasDefault = true;
      return type;
    }
    if (type.isDefault && hasDefault) {
      return { ...type, isDefault: false };
    }
    if (!hasDefault && index === types.length - 1) {
      return { ...type, isDefault: true };
    }
    return type;
  });
}

export function getDefaultAppointmentTypes(): AppointmentTypeConfig[] {
  return defaultAppointmentTypes.map((type, index) => ({
    ...type,
    id: createTypeId(`default-${index + 1}`),
  }));
}

export function normalizeAppointmentTypes(value: unknown): AppointmentTypeConfig[] {
  const defaults = getDefaultAppointmentTypes();
  if (!Array.isArray(value)) {
    return defaults;
  }

  const seenNames = new Set<string>();
  const types: AppointmentTypeConfig[] = [];

  value.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const normalized = normalizeType(item as Partial<AppointmentTypeConfig>, index);
    if (!normalized) {
      return;
    }

    const key = normalized.name.toLowerCase();
    if (seenNames.has(key)) {
      return;
    }
    seenNames.add(key);
    types.push(normalized);
  });

  if (!types.length) {
    return defaults;
  }

  return ensureSingleDefault(types);
}

export function loadAppointmentTypes(): AppointmentTypeConfig[] {
  if (typeof window === "undefined") {
    return getDefaultAppointmentTypes();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultAppointmentTypes();
    }
    return normalizeAppointmentTypes(JSON.parse(raw));
  } catch {
    return getDefaultAppointmentTypes();
  }
}

export function saveAppointmentTypes(types: AppointmentTypeConfig[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ensureSingleDefault(types)));
}

export function formatDurationMinutes(durationMin: number) {
  const safe = Math.max(1, Math.round(durationMin));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes} min`;
}
