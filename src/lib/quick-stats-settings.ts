export type QuickStatOptionKey =
  | "checkedInOut"
  | "noShow"
  | "canceled"
  | "openEncounters"
  | "closedEncounters"
  | "currentBill";

export interface QuickStatsSettings {
  visibleStats: Record<QuickStatOptionKey, boolean>;
}

export type QuickStatOption = {
  key: QuickStatOptionKey;
  label: string;
  description: string;
};

const STORAGE_KEY = "casemate.quick-stats-settings.v1";

export const quickStatOptions: QuickStatOption[] = [
  {
    key: "checkedInOut",
    label: "Checked In / Out",
    description: "Shows attended appointment count (Check In + Check Out).",
  },
  {
    key: "noShow",
    label: "No Show",
    description: "Shows missed appointment count.",
  },
  {
    key: "canceled",
    label: "Canceled",
    description: "Shows canceled appointment count.",
  },
  {
    key: "openEncounters",
    label: "Open Encounters",
    description: "Shows number of open (not closed) encounter notes.",
  },
  {
    key: "closedEncounters",
    label: "Closed Encounters",
    description: "Shows number of closed encounter notes.",
  },
  {
    key: "currentBill",
    label: "Current Bill",
    description: "Shows total of all encounter charges for this patient.",
  },
];

export function getDefaultQuickStatsSettings(): QuickStatsSettings {
  return {
    visibleStats: {
      checkedInOut: true,
      noShow: true,
      canceled: true,
      openEncounters: true,
      closedEncounters: true,
      currentBill: true,
    },
  };
}

function normalizeVisibleStats(value: unknown, fallback: Record<QuickStatOptionKey, boolean>) {
  if (!value || typeof value !== "object") {
    return { ...fallback };
  }
  const raw = value as Partial<Record<QuickStatOptionKey, unknown>>;
  return {
    checkedInOut:
      typeof raw.checkedInOut === "boolean" ? raw.checkedInOut : fallback.checkedInOut,
    noShow: typeof raw.noShow === "boolean" ? raw.noShow : fallback.noShow,
    canceled: typeof raw.canceled === "boolean" ? raw.canceled : fallback.canceled,
    openEncounters:
      typeof raw.openEncounters === "boolean" ? raw.openEncounters : fallback.openEncounters,
    closedEncounters:
      typeof raw.closedEncounters === "boolean" ? raw.closedEncounters : fallback.closedEncounters,
    currentBill: typeof raw.currentBill === "boolean" ? raw.currentBill : fallback.currentBill,
  };
}

export function normalizeQuickStatsSettings(value: unknown): QuickStatsSettings {
  const defaults = getDefaultQuickStatsSettings();
  if (!value || typeof value !== "object") {
    return defaults;
  }

  const raw = value as Partial<QuickStatsSettings> &
    Partial<Record<QuickStatOptionKey, unknown>>;
  const rawVisibleStats =
    raw.visibleStats && typeof raw.visibleStats === "object" ? raw.visibleStats : raw;

  return {
    visibleStats: normalizeVisibleStats(rawVisibleStats, defaults.visibleStats),
  };
}

export function loadQuickStatsSettings(): QuickStatsSettings {
  if (typeof window === "undefined") {
    return getDefaultQuickStatsSettings();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultQuickStatsSettings();
    }
    return normalizeQuickStatsSettings(JSON.parse(raw));
  } catch {
    return getDefaultQuickStatsSettings();
  }
}

export function saveQuickStatsSettings(settings: QuickStatsSettings) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(normalizeQuickStatsSettings(settings)),
  );
}
