import { formatUsPhoneInput } from "@/lib/phone-format";

export interface OfficeSettings {
  officeName: string;
  phone: string;
  fax: string;
  email: string;
  address: string;
  doctorName: string;
  logoDataUrl: string;
  deletePassword: string;
}

const STORAGE_KEY = "casemate.office-settings.v1";

const defaultOfficeSettings: OfficeSettings = {
  officeName: "Prime Spine & Wellness",
  phone: "818-696-8868",
  fax: "747-699-1911",
  email: "contact@primespinewellness.com",
  address: "815 E. Colorado St. Unit 250, Glendale, CA 91205",
  doctorName: "Dr. Mike Galstyan",
  logoDataUrl: "",
  deletePassword: "",
};

function normalizeString(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  return value.trim();
}

function normalizeLogoDataUrl(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  const next = value.trim();
  if (!next) {
    return "";
  }
  if (next.startsWith("data:image/")) {
    return next;
  }
  return "";
}

export function getDefaultOfficeSettings() {
  return { ...defaultOfficeSettings };
}

export function normalizeOfficeSettings(value: unknown): OfficeSettings {
  if (!value || typeof value !== "object") {
    return getDefaultOfficeSettings();
  }
  const row = value as Partial<OfficeSettings>;
  return {
    officeName: normalizeString(row.officeName, defaultOfficeSettings.officeName),
    phone: formatUsPhoneInput(normalizeString(row.phone, defaultOfficeSettings.phone)),
    fax: formatUsPhoneInput(normalizeString(row.fax, defaultOfficeSettings.fax)),
    email: normalizeString(row.email, defaultOfficeSettings.email),
    address: normalizeString(row.address, defaultOfficeSettings.address),
    doctorName: normalizeString(row.doctorName, defaultOfficeSettings.doctorName),
    logoDataUrl: normalizeLogoDataUrl(row.logoDataUrl),
    deletePassword: normalizeString(row.deletePassword),
  };
}

export function loadOfficeSettings(): OfficeSettings {
  if (typeof window === "undefined") {
    return getDefaultOfficeSettings();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultOfficeSettings();
    }
    return normalizeOfficeSettings(JSON.parse(raw));
  } catch {
    return getDefaultOfficeSettings();
  }
}

export function saveOfficeSettings(settings: OfficeSettings) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  void import("@/lib/kv-cloud").then((m) => m.dualWriteKv(STORAGE_KEY, "tasks", settings));
}
