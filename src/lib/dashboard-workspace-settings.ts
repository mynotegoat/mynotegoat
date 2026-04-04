export type XrayClearCondition = "patientRefused" | "completedPriorCare" | "reviewed" | "noXray";
export type MriCtClearCondition = "patientRefused" | "completedPriorCare" | "reviewed" | "noMri";
export type SpecialistClearCondition = "patientRefused" | "completedPriorCare" | "report" | "noPm";
export type SpecialistAppearWhen = "mri_sent" | "mri_reviewed";

export const XRAY_CLEAR_OPTIONS: { value: XrayClearCondition; label: string }[] = [
  { value: "patientRefused", label: "Patient Refused" },
  { value: "completedPriorCare", label: "Completed Prior Care" },
  { value: "reviewed", label: "Reviewed" },
  { value: "noXray", label: "No X-Ray" },
];

export const MRI_CT_CLEAR_OPTIONS: { value: MriCtClearCondition; label: string }[] = [
  { value: "patientRefused", label: "Patient Refused" },
  { value: "completedPriorCare", label: "Completed Prior Care" },
  { value: "reviewed", label: "Reviewed" },
  { value: "noMri", label: "No MRI" },
];

export const SPECIALIST_CLEAR_OPTIONS: { value: SpecialistClearCondition; label: string }[] = [
  { value: "patientRefused", label: "Patient Refused" },
  { value: "completedPriorCare", label: "Completed Prior Care" },
  { value: "report", label: "Received" },
  { value: "noPm", label: "No Spcl" },
];

export interface DashboardWorkspaceSettings {
  myTasks: {
    showOnDashboard: boolean;
    openOnly: boolean;
    maxItems: number;
  };
  patientFollowUp: {
    showOnDashboard: boolean;
    includeXray: boolean;
    includeMriCt: boolean;
    includeSpecialist: boolean;
    includeLienLop: boolean;
    xrayAppearAuto: boolean;
    mriAppearAuto: boolean;
    mriAppearDays: number;
    specialistAppearWhen: SpecialistAppearWhen;
    xrayClearedBy: XrayClearCondition[];
    mriCtClearedBy: MriCtClearCondition[];
    specialistClearedBy: SpecialistClearCondition[];
    lienLopClearStatuses: string[];
    staleDaysThreshold: number;
    maxItems: number;
  };
}

const STORAGE_KEY = "casemate.dashboard-workspace-settings.v1";

const VALID_XRAY_CLEAR: Set<string> = new Set(["patientRefused", "completedPriorCare", "reviewed", "noXray"]);
const VALID_MRI_CLEAR: Set<string> = new Set(["patientRefused", "completedPriorCare", "reviewed", "noMri"]);
const VALID_SPECIALIST_CLEAR: Set<string> = new Set(["patientRefused", "completedPriorCare", "report", "noPm"]);

export function getDefaultDashboardWorkspaceSettings(): DashboardWorkspaceSettings {
  return {
    myTasks: {
      showOnDashboard: true,
      openOnly: true,
      maxItems: 6,
    },
    patientFollowUp: {
      showOnDashboard: true,
      includeXray: true,
      includeMriCt: true,
      includeSpecialist: true,
      includeLienLop: true,
      xrayAppearAuto: true,
      mriAppearAuto: true,
      mriAppearDays: 21,
      specialistAppearWhen: "mri_sent",
      xrayClearedBy: ["patientRefused", "completedPriorCare", "reviewed", "noXray"],
      mriCtClearedBy: ["patientRefused", "completedPriorCare", "reviewed", "noMri"],
      specialistClearedBy: ["patientRefused", "completedPriorCare", "report", "noPm"],
      lienLopClearStatuses: ["Received"],
      staleDaysThreshold: 14,
      maxItems: 10,
    },
  };
}

function normalizeNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeSpecialistAppearWhen(value: unknown, fallback: SpecialistAppearWhen): SpecialistAppearWhen {
  return value === "mri_sent" || value === "mri_reviewed" ? value : fallback;
}

function normalizeClearArray<T extends string>(value: unknown, validSet: Set<string>, fallback: T[]): T[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const result: T[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry === "string" && validSet.has(entry) && !seen.has(entry)) {
      seen.add(entry);
      result.push(entry as T);
    }
  }
  return result.length > 0 ? result : fallback;
}

function normalizeStatusList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const deduped = new Set<string>();
  value.forEach((entry) => {
    if (typeof entry !== "string") {
      return;
    }
    const normalized = entry.trim();
    if (!normalized) {
      return;
    }
    deduped.add(normalized);
  });
  return deduped.size ? Array.from(deduped).slice(0, 20) : fallback;
}

export function normalizeDashboardWorkspaceSettings(value: unknown): DashboardWorkspaceSettings {
  const defaults = getDefaultDashboardWorkspaceSettings();
  if (!value || typeof value !== "object") {
    return defaults;
  }
  const raw = value as Partial<DashboardWorkspaceSettings>;
  const rawMyTasks = (raw.myTasks ?? {}) as Partial<DashboardWorkspaceSettings["myTasks"]>;
  const rawFollowUp = (raw.patientFollowUp ?? {}) as Partial<
    DashboardWorkspaceSettings["patientFollowUp"]
  >;

  // Migration: if old xrayClearWhen/mriCtClearWhen/specialistClearWhen fields exist, map them
  const rawAny = rawFollowUp as Record<string, unknown>;
  let xrayClearedByRaw = rawFollowUp.xrayClearedBy;
  let mriCtClearedByRaw = rawFollowUp.mriCtClearedBy;
  let specialistClearedByRaw = rawFollowUp.specialistClearedBy;

  if (!xrayClearedByRaw && typeof rawAny.xrayClearWhen === "string") {
    xrayClearedByRaw = ["patientRefused", "completedPriorCare", rawAny.xrayClearWhen as XrayClearCondition, "noXray"];
  }
  if (!mriCtClearedByRaw && typeof rawAny.mriCtClearWhen === "string") {
    mriCtClearedByRaw = ["patientRefused", "completedPriorCare", rawAny.mriCtClearWhen as MriCtClearCondition, "noMri"];
  }
  if (!specialistClearedByRaw && typeof rawAny.specialistClearWhen === "string") {
    specialistClearedByRaw = ["patientRefused", "completedPriorCare", rawAny.specialistClearWhen as SpecialistClearCondition, "noPm"];
  }

  return {
    myTasks: {
      showOnDashboard:
        typeof rawMyTasks.showOnDashboard === "boolean"
          ? rawMyTasks.showOnDashboard
          : defaults.myTasks.showOnDashboard,
      openOnly: typeof rawMyTasks.openOnly === "boolean" ? rawMyTasks.openOnly : defaults.myTasks.openOnly,
      maxItems: normalizeNumber(rawMyTasks.maxItems, 1, 25, defaults.myTasks.maxItems),
    },
    patientFollowUp: {
      showOnDashboard:
        typeof rawFollowUp.showOnDashboard === "boolean"
          ? rawFollowUp.showOnDashboard
          : defaults.patientFollowUp.showOnDashboard,
      includeXray:
        typeof rawFollowUp.includeXray === "boolean" ? rawFollowUp.includeXray : defaults.patientFollowUp.includeXray,
      includeMriCt:
        typeof rawFollowUp.includeMriCt === "boolean"
          ? rawFollowUp.includeMriCt
          : defaults.patientFollowUp.includeMriCt,
      includeSpecialist:
        typeof rawFollowUp.includeSpecialist === "boolean"
          ? rawFollowUp.includeSpecialist
          : defaults.patientFollowUp.includeSpecialist,
      includeLienLop:
        typeof rawFollowUp.includeLienLop === "boolean"
          ? rawFollowUp.includeLienLop
          : defaults.patientFollowUp.includeLienLop,
      xrayAppearAuto:
        typeof rawFollowUp.xrayAppearAuto === "boolean"
          ? rawFollowUp.xrayAppearAuto
          : defaults.patientFollowUp.xrayAppearAuto,
      mriAppearAuto:
        typeof rawFollowUp.mriAppearAuto === "boolean"
          ? rawFollowUp.mriAppearAuto
          : defaults.patientFollowUp.mriAppearAuto,
      mriAppearDays: normalizeNumber(rawFollowUp.mriAppearDays, 1, 365, defaults.patientFollowUp.mriAppearDays),
      specialistAppearWhen: normalizeSpecialistAppearWhen(
        rawFollowUp.specialistAppearWhen,
        defaults.patientFollowUp.specialistAppearWhen,
      ),
      xrayClearedBy: normalizeClearArray(xrayClearedByRaw, VALID_XRAY_CLEAR, defaults.patientFollowUp.xrayClearedBy),
      mriCtClearedBy: normalizeClearArray(mriCtClearedByRaw, VALID_MRI_CLEAR, defaults.patientFollowUp.mriCtClearedBy),
      specialistClearedBy: normalizeClearArray(
        specialistClearedByRaw,
        VALID_SPECIALIST_CLEAR,
        defaults.patientFollowUp.specialistClearedBy,
      ),
      lienLopClearStatuses: normalizeStatusList(
        rawFollowUp.lienLopClearStatuses,
        defaults.patientFollowUp.lienLopClearStatuses,
      ),
      staleDaysThreshold: normalizeNumber(
        rawFollowUp.staleDaysThreshold,
        1,
        365,
        defaults.patientFollowUp.staleDaysThreshold,
      ),
      maxItems: normalizeNumber(rawFollowUp.maxItems, 1, 50, defaults.patientFollowUp.maxItems),
    },
  };
}

export function loadDashboardWorkspaceSettings(): DashboardWorkspaceSettings {
  if (typeof window === "undefined") {
    return getDefaultDashboardWorkspaceSettings();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultDashboardWorkspaceSettings();
    }
    return normalizeDashboardWorkspaceSettings(JSON.parse(raw));
  } catch {
    return getDefaultDashboardWorkspaceSettings();
  }
}

export function saveDashboardWorkspaceSettings(settings: DashboardWorkspaceSettings) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeDashboardWorkspaceSettings(settings)));
}
