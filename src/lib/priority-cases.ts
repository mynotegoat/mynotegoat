import type { PatientPriority } from "@/lib/mock-data";

export interface PriorityCaseRules {
  statusNames: string[];
  includeMriDue: boolean;
  mriDueDaysFromInitial: number;
  includeNoUpdate: boolean;
  noUpdateDaysThreshold: number;
  includeRbStatusCheck: boolean;
  rbStatusCheckDaysThreshold: number;
  maxItems: number;
}

const STORAGE_KEY = "casemate.dashboard-priority-rules.v1";

const allowedPriorityFlags: PatientPriority[] = ["MRI Due", "No Recent Update"];

export function getDefaultPriorityCaseRules(): PriorityCaseRules {
  return {
    statusNames: ["Ready To Submit", "Submitted"],
    includeMriDue: true,
    mriDueDaysFromInitial: 21,
    includeNoUpdate: true,
    noUpdateDaysThreshold: 14,
    includeRbStatusCheck: false,
    rbStatusCheckDaysThreshold: 60,
    maxItems: 6,
  };
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const list: string[] = [];
  value.forEach((item) => {
    if (typeof item !== "string") {
      return;
    }
    const trimmed = item.trim();
    if (!trimmed) {
      return;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    list.push(trimmed);
  });
  return list;
}

function normalizeFlagList(value: unknown): PatientPriority[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const flags: PatientPriority[] = [];
  const seen = new Set<string>();

  value.forEach((item) => {
    if (typeof item !== "string") {
      return;
    }
    const maybeFlag = item as PatientPriority;
    if (!allowedPriorityFlags.includes(maybeFlag)) {
      return;
    }
    const key = maybeFlag.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    flags.push(maybeFlag);
  });

  return flags;
}

export function normalizePriorityCaseRules(value: unknown): PriorityCaseRules {
  const defaults = getDefaultPriorityCaseRules();
  if (!value || typeof value !== "object") {
    return defaults;
  }

  const raw = value as Partial<PriorityCaseRules>;
  const legacyRaw = raw as Partial<{
    priorityFlags: PatientPriority[];
    includeStaleLastUpdate: boolean;
    staleDaysThreshold: number;
  }>;
  const legacyFlags = normalizeFlagList(legacyRaw.priorityFlags);

  const mriDueDays =
    typeof raw.mriDueDaysFromInitial === "number" && Number.isFinite(raw.mriDueDaysFromInitial)
      ? Math.max(1, Math.min(365, Math.round(raw.mriDueDaysFromInitial)))
      : defaults.mriDueDaysFromInitial;
  const noUpdateDays =
    typeof raw.noUpdateDaysThreshold === "number" && Number.isFinite(raw.noUpdateDaysThreshold)
      ? Math.max(1, Math.min(365, Math.round(raw.noUpdateDaysThreshold)))
      : typeof legacyRaw.staleDaysThreshold === "number" && Number.isFinite(legacyRaw.staleDaysThreshold)
        ? Math.max(1, Math.min(365, Math.round(legacyRaw.staleDaysThreshold)))
        : defaults.noUpdateDaysThreshold;
  const rbStatusCheckDays =
    typeof raw.rbStatusCheckDaysThreshold === "number" &&
    Number.isFinite(raw.rbStatusCheckDaysThreshold)
      ? Math.max(1, Math.min(365, Math.round(raw.rbStatusCheckDaysThreshold)))
      : defaults.rbStatusCheckDaysThreshold;
  const maxItems =
    typeof raw.maxItems === "number" && Number.isFinite(raw.maxItems)
      ? Math.max(1, Math.min(50, Math.round(raw.maxItems)))
      : defaults.maxItems;

  return {
    statusNames: normalizeStringList(raw.statusNames),
    includeMriDue:
      typeof raw.includeMriDue === "boolean"
        ? raw.includeMriDue
        : legacyFlags.includes("MRI Due")
          ? true
          : defaults.includeMriDue,
    mriDueDaysFromInitial: mriDueDays,
    includeNoUpdate:
      typeof raw.includeNoUpdate === "boolean"
        ? raw.includeNoUpdate
        : typeof legacyRaw.includeStaleLastUpdate === "boolean"
          ? legacyRaw.includeStaleLastUpdate
          : legacyFlags.includes("No Recent Update")
            ? true
            : defaults.includeNoUpdate,
    noUpdateDaysThreshold: noUpdateDays,
    includeRbStatusCheck:
      typeof raw.includeRbStatusCheck === "boolean"
        ? raw.includeRbStatusCheck
        : defaults.includeRbStatusCheck,
    rbStatusCheckDaysThreshold: rbStatusCheckDays,
    maxItems,
  };
}

export function loadPriorityCaseRules(): PriorityCaseRules {
  if (typeof window === "undefined") {
    return getDefaultPriorityCaseRules();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultPriorityCaseRules();
    }
    return normalizePriorityCaseRules(JSON.parse(raw));
  } catch {
    return getDefaultPriorityCaseRules();
  }
}

export function savePriorityCaseRules(rules: PriorityCaseRules) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}
