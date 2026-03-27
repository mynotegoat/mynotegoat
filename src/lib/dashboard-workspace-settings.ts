export type FollowUpImagingClearStage = "sent" | "done" | "received" | "reviewed";
export type FollowUpSpecialistClearStage = "sent" | "scheduled" | "report";

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
    xrayClearWhen: FollowUpImagingClearStage;
    mriCtClearWhen: FollowUpImagingClearStage;
    specialistClearWhen: FollowUpSpecialistClearStage;
    lienLopClearStatuses: string[];
    staleDaysThreshold: number;
    maxItems: number;
  };
}

const STORAGE_KEY = "casemate.dashboard-workspace-settings.v1";

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
      xrayClearWhen: "reviewed",
      mriCtClearWhen: "reviewed",
      specialistClearWhen: "report",
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

function normalizeImagingClearStage(
  value: unknown,
  fallback: FollowUpImagingClearStage,
): FollowUpImagingClearStage {
  return value === "sent" || value === "done" || value === "received" || value === "reviewed"
    ? value
    : fallback;
}

function normalizeSpecialistClearStage(
  value: unknown,
  fallback: FollowUpSpecialistClearStage,
): FollowUpSpecialistClearStage {
  return value === "sent" || value === "scheduled" || value === "report" ? value : fallback;
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
      xrayClearWhen: normalizeImagingClearStage(
        rawFollowUp.xrayClearWhen,
        defaults.patientFollowUp.xrayClearWhen,
      ),
      mriCtClearWhen: normalizeImagingClearStage(
        rawFollowUp.mriCtClearWhen,
        defaults.patientFollowUp.mriCtClearWhen,
      ),
      specialistClearWhen: normalizeSpecialistClearStage(
        rawFollowUp.specialistClearWhen,
        defaults.patientFollowUp.specialistClearWhen,
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
