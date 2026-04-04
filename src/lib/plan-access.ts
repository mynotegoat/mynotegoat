export type PlanTier = "tracking" | "track_schedule" | "complete";

export type PortalFeature =
  | "dashboard"
  | "patients"
  | "statistics"
  | "tasks"
  | "contacts"
  | "appointments"
  | "encounters"
  | "keyDates"
  | "billing"
  | "settings";

export type PortalNavItem = {
  href: string;
  label: string;
  feature: PortalFeature;
};

export const portalNavItems: PortalNavItem[] = [
  { href: "/dashboard", label: "Dashboard", feature: "dashboard" },
  { href: "/patients", label: "Patients", feature: "patients" },
  { href: "/statistics", label: "Statistics", feature: "statistics" },
  { href: "/tasks", label: "To Do", feature: "tasks" },
  { href: "/contacts", label: "Contacts", feature: "contacts" },
  { href: "/appointments", label: "Schedule", feature: "appointments" },
  { href: "/encounters", label: "Encounters", feature: "encounters" },
  { href: "/key-dates", label: "Key Dates", feature: "keyDates" },
  { href: "/billing", label: "Billing", feature: "billing" },
  { href: "/settings", label: "Settings", feature: "settings" },
];

const planFeatureMap: Record<PlanTier, PortalFeature[]> = {
  tracking: [
    "dashboard",
    "patients",
    "statistics",
    "tasks",
    "contacts",
    "keyDates",
    "settings",
  ],
  track_schedule: [
    "dashboard",
    "patients",
    "statistics",
    "tasks",
    "contacts",
    "appointments",
    "keyDates",
    "settings",
  ],
  complete: [
    "dashboard",
    "patients",
    "statistics",
    "tasks",
    "contacts",
    "appointments",
    "encounters",
    "keyDates",
    "billing",
    "settings",
  ],
};

const fallbackPlan: PlanTier = "complete";

function normalizePlanToken(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function normalizePlanTier(value: unknown): PlanTier {
  const normalized = normalizePlanToken(value);
  if (normalized === "tracking" || normalized === "track_only") {
    return "tracking";
  }
  if (
    normalized === "track_schedule" ||
    normalized === "track_and_schedule" ||
    normalized === "tracking_schedule"
  ) {
    return "track_schedule";
  }
  if (normalized === "complete" || normalized === "full") {
    return "complete";
  }
  return fallbackPlan;
}

export function hasPortalFeature(planTier: PlanTier, feature: PortalFeature) {
  return planFeatureMap[planTier].includes(feature);
}

export function getVisiblePortalNavItems(planTier: PlanTier) {
  return portalNavItems.filter((item) => hasPortalFeature(planTier, item.feature));
}

export function getDefaultPortalPath(planTier: PlanTier) {
  const firstAllowed = getVisiblePortalNavItems(planTier)[0];
  return firstAllowed?.href ?? "/dashboard";
}

export function resolvePortalFeatureFromPath(pathname: string): PortalFeature | null {
  if (pathname.startsWith("/dashboard")) {
    return "dashboard";
  }
  if (pathname.startsWith("/patients")) {
    return "patients";
  }
  if (pathname.startsWith("/statistics")) {
    return "statistics";
  }
  if (pathname.startsWith("/tasks")) {
    return "tasks";
  }
  if (pathname.startsWith("/contacts")) {
    return "contacts";
  }
  if (pathname.startsWith("/appointments")) {
    return "appointments";
  }
  if (pathname.startsWith("/encounters")) {
    return "encounters";
  }
  if (pathname.startsWith("/key-dates")) {
    return "keyDates";
  }
  if (pathname.startsWith("/billing")) {
    return "billing";
  }
  if (pathname.startsWith("/settings")) {
    return "settings";
  }
  return null;
}

export function isPortalPathAllowed(planTier: PlanTier, pathname: string) {
  const feature = resolvePortalFeatureFromPath(pathname);
  if (!feature) {
    return true;
  }
  return hasPortalFeature(planTier, feature);
}
