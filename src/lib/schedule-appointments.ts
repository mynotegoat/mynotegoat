import { appointments as legacyAppointments } from "@/lib/mock-data";

export type AppointmentStatus =
  | "Scheduled"
  | "Check In"
  | "Check Out"
  | "No Show"
  | "Canceled"
  | "Reschedule";

export interface ScheduleAppointmentRecord {
  id: string;
  patientId: string;
  patientName: string;
  provider: string;
  location: string;
  appointmentType: string;
  caseLabel: string;
  room: string;
  date: string;
  startTime: string;
  durationMin: number;
  status: AppointmentStatus;
  note: string;
  overrideOfficeHours: boolean;
  recurringSeriesId?: string;
}

const STORAGE_KEY = "casemate.schedule-appointments.v1";
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const appointmentStatusOptions: AppointmentStatus[] = [
  "Scheduled",
  "Check In",
  "Check Out",
  "No Show",
  "Canceled",
  "Reschedule",
];

export const appointmentTypeOptions = [
  "Personal Injury Office Visit",
  "Spinal Decompression - C/S",
  "PI Re-Exam",
  "PI Discharge Visit",
  "Follow-Up Visit",
];

export const defaultScheduleLocation = "Prime Spine Glendale";
export const defaultScheduleProvider = "Galstyan, Mike (Dr. Mike)";

function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDate(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }
  const candidate = value.trim();
  return datePattern.test(candidate) ? candidate : fallback;
}

function to24HourTime(value: string) {
  const normalized = value.trim();
  if (timePattern.test(normalized)) {
    return normalized;
  }

  const legacy = normalized.match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i);
  if (!legacy) {
    return null;
  }

  let hours = Number(legacy[1]);
  const minutes = Number(legacy[2]);
  const meridiem = legacy[3].toUpperCase();
  if (meridiem === "AM" && hours === 12) {
    hours = 0;
  }
  if (meridiem === "PM" && hours < 12) {
    hours += 12;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeTime(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = to24HourTime(value);
  return normalized && timePattern.test(normalized) ? normalized : fallback;
}

function normalizeStatus(value: unknown): AppointmentStatus {
  if (typeof value !== "string") {
    return "Scheduled";
  }
  const candidate = value.trim().toLowerCase();
  if (candidate === "check in" || candidate === "checked in") {
    return "Check In";
  }
  if (candidate === "check out" || candidate === "checked out" || candidate === "seen") {
    return "Check Out";
  }
  if (candidate === "no show") {
    return "No Show";
  }
  if (candidate === "canceled" || candidate === "cancelled") {
    return "Canceled";
  }
  if (candidate === "reschedule" || candidate === "rescheduled") {
    return "Reschedule";
  }
  return "Scheduled";
}

function toInt(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(5, Math.min(720, Math.round(value)));
}

function normalizeText(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  return value.trim();
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const candidate = value.trim();
  return candidate ? candidate : undefined;
}

function normalizeRecord(value: unknown, fallbackDate: string): ScheduleAppointmentRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Partial<ScheduleAppointmentRecord>;
  const id = normalizeText(row.id);
  const patientName = normalizeText(row.patientName);

  if (!id || !patientName) {
    return null;
  }

  const startTime = normalizeTime(row.startTime, "08:00");

  return {
    id,
    patientId: normalizeText(row.patientId),
    patientName,
    provider: normalizeText(row.provider, defaultScheduleProvider),
    location: normalizeText(row.location, defaultScheduleLocation),
    appointmentType: normalizeText(row.appointmentType, "Personal Injury Office Visit"),
    caseLabel: normalizeText(row.caseLabel),
    room: normalizeText(row.room),
    date: normalizeDate(row.date, fallbackDate),
    startTime,
    durationMin: toInt(row.durationMin, 30),
    status: normalizeStatus(row.status),
    note: normalizeText(row.note),
    overrideOfficeHours: Boolean(row.overrideOfficeHours),
    recurringSeriesId: normalizeOptionalText(row.recurringSeriesId),
  };
}

function compareAppointments(left: ScheduleAppointmentRecord, right: ScheduleAppointmentRecord) {
  const leftKey = `${left.date} ${left.startTime}`;
  const rightKey = `${right.date} ${right.startTime}`;
  return leftKey.localeCompare(rightKey);
}

export function normalizeScheduleAppointments(value: unknown): ScheduleAppointmentRecord[] {
  const fallbackDate = getTodayIsoDate();
  if (!Array.isArray(value)) {
    return getDefaultScheduleAppointments();
  }

  const seen = new Set<string>();
  const records: ScheduleAppointmentRecord[] = [];

  value.forEach((entry) => {
    const normalized = normalizeRecord(entry, fallbackDate);
    if (!normalized || seen.has(normalized.id)) {
      return;
    }
    seen.add(normalized.id);
    records.push(normalized);
  });

  return records.length ? records.sort(compareAppointments) : getDefaultScheduleAppointments();
}

function mapLegacyStatus(value: string): AppointmentStatus {
  if (value === "Checked In") {
    return "Check In";
  }
  if (value === "Seen") {
    return "Check Out";
  }
  return "Scheduled";
}

export function getDefaultScheduleAppointments(): ScheduleAppointmentRecord[] {
  const today = getTodayIsoDate();
  return legacyAppointments
    .map((entry) => ({
      id: entry.id,
      patientId: entry.patientId,
      patientName: entry.patientName,
      provider: entry.provider || defaultScheduleProvider,
      location: defaultScheduleLocation,
      appointmentType: entry.appointmentType,
      caseLabel: "",
      room: "",
      date: today,
      startTime: to24HourTime(entry.start) ?? "08:00",
      durationMin: toInt(entry.durationMin, 30),
      status: mapLegacyStatus(entry.status),
      note: "",
      overrideOfficeHours: false,
    }))
    .sort(compareAppointments);
}

export function loadScheduleAppointments(): ScheduleAppointmentRecord[] {
  if (typeof window === "undefined") {
    return getDefaultScheduleAppointments();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultScheduleAppointments();
    }
    return normalizeScheduleAppointments(JSON.parse(raw));
  } catch {
    return getDefaultScheduleAppointments();
  }
}

export function saveScheduleAppointments(records: ScheduleAppointmentRecord[]) {
  if (typeof window === "undefined") {
    return;
  }
  const next = [...records].sort(compareAppointments);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function createAppointmentId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getStatusBadgeClass(status: AppointmentStatus) {
  switch (status) {
    case "Check In":
      return "bg-[rgba(13,121,191,0.14)] text-[#0d79bf]";
    case "Check Out":
      return "bg-[rgba(31,157,96,0.14)] text-[#1f9d60]";
    case "No Show":
      return "bg-[rgba(201,66,58,0.14)] text-[#b43b34]";
    case "Canceled":
      return "bg-[rgba(124,141,158,0.2)] text-[#516578]";
    case "Reschedule":
      return "bg-[rgba(240,141,63,0.18)] text-[#9d5f1e]";
    default:
      return "bg-[rgba(26,160,162,0.16)] text-[#1a6f70]";
  }
}

export function formatTimeLabel(value: string) {
  const match = timePattern.exec(value);
  if (!match) {
    return value;
  }
  const rawHours = Number(match[1]);
  const minutes = match[2];
  const meridiem = rawHours >= 12 ? "PM" : "AM";
  const hour12 = rawHours % 12 === 0 ? 12 : rawHours % 12;
  return `${String(hour12).padStart(2, "0")}:${minutes} ${meridiem}`;
}
