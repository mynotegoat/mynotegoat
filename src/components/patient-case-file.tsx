"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useBillingMacros } from "@/hooks/use-billing-macros";
import { useCaseStatuses } from "@/hooks/use-case-statuses";
import { useContactDirectory } from "@/hooks/use-contact-directory";
import { useDocumentTemplates } from "@/hooks/use-document-templates";
import { useEncounterNotes } from "@/hooks/use-encounter-notes";
import { useMacroTemplates } from "@/hooks/use-macro-templates";
import { useOfficeSettings } from "@/hooks/use-office-settings";
import { usePatientDiagnoses } from "@/hooks/use-patient-diagnoses";
import { usePatientBilling } from "@/hooks/use-patient-billing";
import { usePatientFollowUpOverrides } from "@/hooks/use-patient-follow-up-overrides";
import { useQuickStatsSettings } from "@/hooks/use-quick-stats-settings";
import { useReportTemplates } from "@/hooks/use-report-templates";
import { useScheduleAppointments } from "@/hooks/use-schedule-appointments";
import { useTasks } from "@/hooks/use-tasks";
import { getContrastTextColor, withAlpha } from "@/lib/color-utils";
import { renderDocumentTemplate, type DocumentTemplateScope } from "@/lib/document-templates";
import { encounterSections } from "@/lib/encounter-notes";
import { formatUsPhoneInput } from "@/lib/phone-format";
import { type QuickStatOptionKey } from "@/lib/quick-stats-settings";
import { buildNarrativeReportContext, renderNarrativeReportBody } from "@/lib/report-generator";
import { type ScheduleAppointmentRecord } from "@/lib/schedule-appointments";
import { type TaskPriority } from "@/lib/tasks";
import {
  patients as allPatients,
  type PatientRecord,
  updatePatientRecordById,
} from "@/lib/mock-data";

type ImagingMode = "xray" | "mri";
type ImagingPanelKey = "xray" | "mri" | "specialist";
type SectionPanelKey =
  | "findings"
  | "notes"
  | "reExam"
  | "relatedCases"
  | "quickStats"
  | "appointments"
  | "diagnosis"
  | "letters"
  | "narrative"
  | "additionalDetails";
type PopupAnchor = {
  x: number;
  y: number;
};
type ImagingLaterality = "L" | "R" | "BL";
type ImagingRegionOption = {
  label: string;
  modalities: ImagingMode[];
};

type ImagingFormState = {
  sentDate: string;
  center: string;
  isCt?: boolean;
  regions: string[];
  lateralityByRegion: Record<string, ImagingLaterality>;
  flexExtRegions: string[];
  doneDate: string;
  reportReceivedDate: string;
  reportReviewedDate: string;
};

type ImagingReferral = ImagingFormState & {
  id: string;
  modalityLabel: "X-Ray" | "MRI" | "CT";
};

type SpecialistReferral = {
  id: string;
  specialist: string;
  sentDate: string;
  scheduledDate: string;
  reportReceivedDate: string;
};

type RelatedCaseEntry = {
  patientId: string;
  fullName: string;
  dateOfLoss: string;
};

type NarrativePreviewState = {
  title: string;
  fontFamily: string;
  headerHtml: string;
  bodyHtml: string;
};

const imagingRegions: ImagingRegionOption[] = [
  { label: "Brain", modalities: ["mri"] },
  { label: "Cervical", modalities: ["xray", "mri"] },
  { label: "Thoracic", modalities: ["xray", "mri"] },
  { label: "Lumbar", modalities: ["xray", "mri"] },
  { label: "Chest", modalities: ["xray", "mri"] },
  { label: "Sacrum", modalities: ["xray", "mri"] },
  { label: "Shoulder", modalities: ["xray", "mri"] },
  { label: "Humerus", modalities: ["xray"] },
  { label: "Elbow", modalities: ["xray", "mri"] },
  { label: "Forearm", modalities: ["xray"] },
  { label: "Wrist", modalities: ["xray", "mri"] },
  { label: "Hand", modalities: ["xray", "mri"] },
  { label: "Hip", modalities: ["xray", "mri"] },
  { label: "Femur", modalities: ["xray"] },
  { label: "Tibula/Fibula", modalities: ["xray"] },
  { label: "Knee", modalities: ["xray", "mri"] },
  { label: "Ankle", modalities: ["xray", "mri"] },
  { label: "Foot", modalities: ["xray", "mri"] },
];
const lateralityOptions: ImagingLaterality[] = ["L", "R", "BL"];
const lateralityEnabledRegions = new Set([
  "shoulder",
  "elbow",
  "wrist",
  "hand",
  "hip",
  "knee",
  "ankle",
  "foot",
]);
const xrayFlexExtEnabledRegions = new Set(["cervical", "thoracic", "lumbar"]);

const reviewOptions = ["Not Requested", "Requested", "Received"];

function getNames(fullName: string) {
  const [lastName = "", firstName = ""] = fullName.split(",").map((value) => value.trim());
  return { firstName, lastName };
}

function normalizeLookupValue(value: string) {
  return value.trim().toLowerCase();
}

function normalizeNameForLookup(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function buildPatientNameLookupSet(fullName: string, firstName: string, lastName: string) {
  const set = new Set<string>();
  const push = (value: string) => {
    const normalized = normalizeNameForLookup(value);
    if (normalized) {
      set.add(normalized);
    }
  };
  push(fullName);
  if (firstName || lastName) {
    push(`${firstName} ${lastName}`);
    push(`${lastName} ${firstName}`);
    push(`${lastName}, ${firstName}`);
    push(`${firstName}, ${lastName}`);
  }
  return set;
}

function isSpecialistReferralContactCategory(category: string) {
  const normalized = normalizeLookupValue(category);
  return normalized !== "attorney" && normalized !== "imaging" && normalized !== "hospital/er";
}

function supportsRegionLaterality(region: string) {
  return lateralityEnabledRegions.has(normalizeLookupValue(region));
}

function supportsXrayFlexExt(region: string) {
  return xrayFlexExtEnabledRegions.has(normalizeLookupValue(region));
}

function formatRegionLabel(region: string, lateralityByRegion: Record<string, ImagingLaterality>) {
  if (!supportsRegionLaterality(region)) {
    return region;
  }
  const laterality = lateralityByRegion[region];
  return laterality ? `${region} (${laterality})` : region;
}

function cloneImagingFormState(value: ImagingFormState): ImagingFormState {
  return {
    ...value,
    regions: [...value.regions],
    flexExtRegions: [...value.flexExtRegions],
    lateralityByRegion: { ...value.lateralityByRegion },
  };
}

function emptyImagingFormState(mode: ImagingMode): ImagingFormState {
  return {
    sentDate: "",
    center: "",
    isCt: mode === "mri" ? false : undefined,
    regions: [],
    lateralityByRegion: {},
    flexExtRegions: [],
    doneDate: "",
    reportReceivedDate: "",
    reportReviewedDate: "",
  };
}

function formatImagingRegionsSummary(entry: ImagingReferral, mode: ImagingMode) {
  if (!entry.regions.length) {
    return "No regions selected";
  }
  return entry.regions
    .map((region) => {
      const baseLabel = formatRegionLabel(region, entry.lateralityByRegion);
      const hasFlexExt = mode === "xray" && entry.flexExtRegions.includes(region);
      return hasFlexExt ? `${baseLabel} (Flex/Ext)` : baseLabel;
    })
    .join(", ");
}

function getUniqueImagingRegionLabels(referrals: ImagingReferral[], mode: ImagingMode) {
  const labels: string[] = [];
  const seen = new Set<string>();

  referrals.forEach((entry) => {
    entry.regions.forEach((region) => {
      const baseLabel = formatRegionLabel(region, entry.lateralityByRegion);
      const hasFlexExt = mode === "xray" && entry.flexExtRegions.includes(region);
      const label = hasFlexExt ? `${baseLabel} (Flex/Ext)` : baseLabel;
      const key = normalizeLookupValue(label);
      if (!seen.has(key)) {
        seen.add(key);
        labels.push(label);
      }
    });
  });

  return labels;
}

function appendFindingDraftLine(currentValue: string, line: string) {
  const trimmedLine = line.trim();
  if (!trimmedLine) {
    return currentValue;
  }
  const current = currentValue.trimEnd();
  if (!current) {
    return trimmedLine;
  }
  return `${current}\n${trimmedLine}`;
}

function formatFindingsForTemplate(rawValue: string, regionLabels: string[]) {
  const trimmed = rawValue.trim();
  if (trimmed) {
    return trimmed;
  }
  if (!regionLabels.length) {
    return "-";
  }
  return regionLabels.map((region) => `${region}: -`).join("\n");
}

function formatUsDateInput(rawValue: string) {
  const digits = rawValue.replace(/\D/g, "").slice(0, 8);
  if (!digits) {
    return "";
  }
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function toUsDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-");
    return `${month}/${day}/${year}`;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{2}\/\d{2}\/\d{2}$/.test(trimmed)) {
    const [month, day, year2] = trimmed.split("/");
    return `${month}/${day}/20${year2}`;
  }

  return formatUsDateInput(trimmed);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getPopupAnchorFromEvent(event: MouseEvent<HTMLElement>): PopupAnchor {
  return {
    x: event.clientX,
    y: event.clientY,
  };
}

function getPopupAnchorFromElement(element: HTMLElement | null): PopupAnchor | null {
  if (!element) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function getAnchoredModalStyle(
  anchor: PopupAnchor | null,
  maxWidthPx: number,
  maxHeightVh: number,
): CSSProperties {
  if (typeof window === "undefined") {
    return {};
  }
  const margin = 16;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(maxWidthPx, Math.max(360, viewportWidth - margin * 2));
  const maxHeight = Math.min(
    (viewportHeight * maxHeightVh) / 100,
    Math.max(320, viewportHeight - margin * 2),
  );
  const centerX = anchor?.x ?? viewportWidth / 2;
  const centerY = anchor?.y ?? viewportHeight / 2;
  const left = clamp(centerX - width / 2, margin, viewportWidth - width - margin);
  const top = clamp(centerY - 48, margin, viewportHeight - maxHeight - margin);

  return {
    position: "absolute",
    left,
    top,
    width,
    maxHeight,
  };
}

function getTodayUsDate() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  const year = now.getFullYear();
  return `${month}/${day}/${year}`;
}

function parseUsDate(value: string) {
  const formatted = toUsDate(value);
  const match = formatted.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return null;
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function toIsoDateFromUsDate(value: string) {
  const parsed = parseUsDate(value);
  if (!parsed) {
    return "";
  }
  const year = parsed.getUTCFullYear();
  const month = `${parsed.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${parsed.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toSortStampFromUsDate(dateValue: string) {
  const parsedDate = parseUsDate(dateValue);
  if (!parsedDate) {
    return 0;
  }
  const stamp = new Date(
    Date.UTC(
      parsedDate.getUTCFullYear(),
      parsedDate.getUTCMonth(),
      parsedDate.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  ).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}

function addMonthsClamped(date: Date, months: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const shifted = new Date(Date.UTC(year, month + months, day));
  if (shifted.getUTCDate() !== day) {
    shifted.setUTCDate(0);
  }
  return shifted;
}

function getMonthDayDiff(start: Date, end: Date) {
  if (end < start) {
    return null;
  }

  let cursor = new Date(start.getTime());
  let months = 0;

  while (true) {
    const next = addMonthsClamped(cursor, 1);
    if (next <= end) {
      cursor = next;
      months += 1;
      continue;
    }
    break;
  }

  const days = Math.floor((end.getTime() - cursor.getTime()) / 86400000);
  return { months, days };
}

function formatMonthDayDiff(diff: { months: number; days: number } | null) {
  if (!diff) {
    return "-";
  }
  const monthLabel = `${diff.months} month${diff.months === 1 ? "" : "s"}`;
  const dayLabel = `${diff.days} day${diff.days === 1 ? "" : "s"}`;
  return `${monthLabel}, ${dayLabel}`;
}

function formatPercentage(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

function formatUsdCurrency(value: number) {
  if (!Number.isFinite(value)) {
    return "$0.00";
  }
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildCaseNumber(dateOfLoss: string, lastName: string, firstName: string) {
  const formattedDate = toUsDate(dateOfLoss);
  const dateMatch = formattedDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!dateMatch) {
    return "";
  }

  const month = dateMatch[1];
  const day = dateMatch[2];
  const year = dateMatch[3].slice(-2);
  const cleanLast = lastName.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2);
  const cleanFirst = firstName.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2);

  return `${month}${day}${year}${cleanLast}${cleanFirst}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type PrintableDocumentConfig = {
  title: string;
  headerHtml: string;
  bodyHtml: string;
  headerFontFamily: string;
  fontFamily: string;
  includeLogo: boolean;
  logoDataUrl: string;
};

function buildPrintableDocumentHtml(config: PrintableDocumentConfig) {
  const { title, headerHtml, bodyHtml, headerFontFamily, fontFamily, includeLogo, logoDataUrl } = config;
  const safeTitle = escapeHtml(title);
  const safeHeaderFontFamily = escapeHtml(headerFontFamily || "Georgia, 'Times New Roman', serif");
  const safeFontFamily = escapeHtml(fontFamily || "Georgia, 'Times New Roman', serif");
  const safeLogoDataUrl = escapeHtml(logoDataUrl || "");
  const logoMarkup =
    includeLogo && safeLogoDataUrl
      ? `<img alt="Office Logo" src="${safeLogoDataUrl}" class="office-logo" />`
      : "";
  const headerTopMarkup = logoMarkup ? `<div class="header-top">${logoMarkup}</div>` : "";
  const headerMarkup = headerHtml.trim()
    ? `<div class="header">${headerHtml}</div>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
    <style>
      :root {
        color-scheme: light;
      }
      body {
        margin: 0;
        padding: 36px;
        background: #ffffff;
        color: #13293d;
        font-family: ${safeFontFamily};
      }
      .wrapper {
        max-width: 860px;
        margin: 0 auto;
      }
      .content {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: ${safeFontFamily};
        font-size: 18px;
        line-height: 1.52;
      }
      .header {
        margin: 0 0 18px 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: ${safeHeaderFontFamily};
        font-size: 16px;
        line-height: 1.45;
      }
      .header-top {
        display: flex;
        justify-content: flex-end;
        align-items: flex-start;
        margin: 0 0 14px 0;
      }
      .office-logo {
        max-height: 96px;
        width: auto;
        object-fit: contain;
        display: block;
      }
      @page {
        size: Letter;
        margin: 0.55in;
      }
    </style>
  </head>
  <body>
    <main class="wrapper">
      ${headerTopMarkup}
      ${headerMarkup}
      <div class="content">${bodyHtml}</div>
    </main>
  </body>
</html>`;
}

function printHtmlWithIframeFallback(printableHtml: string) {
  const popup = window.open("", "_blank");
  if (popup) {
    popup.document.open();
    popup.document.write(printableHtml);
    popup.document.close();

    const triggerPopupPrint = () => {
      try {
        popup.focus();
        popup.print();
        return true;
      } catch {
        return false;
      }
    };

    if (popup.document.readyState === "complete") {
      setTimeout(() => {
        triggerPopupPrint();
      }, 80);
    } else {
      popup.onload = () => {
        setTimeout(() => {
          triggerPopupPrint();
        }, 80);
      };
    }
    return true;
  }

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const frameDocument = iframe.contentDocument ?? iframe.contentWindow?.document;
  const frameWindow = iframe.contentWindow;
  if (!frameDocument || !frameWindow) {
    iframe.remove();
    return false;
  }

  frameDocument.open();
  frameDocument.write(printableHtml);
  frameDocument.close();

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    iframe.remove();
  };

  frameWindow.onafterprint = cleanup;
  setTimeout(cleanup, 6000);

  setTimeout(() => {
    try {
      frameWindow.focus();
      frameWindow.print();
    } catch {
      cleanup();
    }
  }, 120);

  return true;
}

export function PatientCaseFile({ patient }: { patient: PatientRecord }) {
  const router = useRouter();
  const { officeSettings } = useOfficeSettings();
  const { caseStatuses, lienLabel, lienOptions } = useCaseStatuses();
  const { billingMacros } = useBillingMacros();
  const { contacts, addContact } = useContactDirectory();
  const { documentTemplates } = useDocumentTemplates();
  const { reportTemplates } = useReportTemplates();
  const { quickStatsSettings } = useQuickStatsSettings();
  const { getRecord: getPatientBillingRecord, setCoreFields: setPatientBillingCoreFields } = usePatientBilling();
  const { scheduleAppointments } = useScheduleAppointments();
  const { addTask } = useTasks();
  const { encountersByNewest, createEncounter, setSoapSection } = useEncounterNotes();
  const { macroLibrary } = useMacroTemplates();
  const { entries: patientDiagnoses, addDiagnosis, addBulkDiagnoses, removeDiagnosis } = usePatientDiagnoses(patient.id);
  const { getRecord: getPatientFollowUpOverride, setPatientRefused, setCompletedPriorCare } =
    usePatientFollowUpOverrides();
  const patientBillingRecord = getPatientBillingRecord(patient.id);
  const names = useMemo(() => getNames(patient.fullName), [patient.fullName]);

  const attorneyContacts = useMemo(
    () => contacts.filter((contact) => normalizeLookupValue(contact.category) === "attorney"),
    [contacts],
  );
  const imagingCenters = useMemo(
    () =>
      contacts
        .filter((contact) => normalizeLookupValue(contact.category) === "imaging")
        .map((contact) => contact.name),
    [contacts],
  );
  const specialistContactDirectory = useMemo(
    () => contacts.filter((contact) => isSpecialistReferralContactCategory(contact.category)),
    [contacts],
  );
  const specialistContacts = useMemo(
    () => specialistContactDirectory.map((contact) => contact.name),
    [specialistContactDirectory],
  );

  const [firstName, setFirstName] = useState(names.firstName);
  const [lastName, setLastName] = useState(names.lastName);
  const [attorney, setAttorney] = useState(patient.attorney);
  const [showAddAttorneyPrompt, setShowAddAttorneyPrompt] = useState(false);
  const [showAddAttorneyForm, setShowAddAttorneyForm] = useState(false);
  const [dismissedAttorneyDrafts, setDismissedAttorneyDrafts] = useState<string[]>([]);
  const [attorneyModalError, setAttorneyModalError] = useState("");
  const [newAttorneyDraft, setNewAttorneyDraft] = useState({
    name: "",
    phone: "",
    fax: "",
    email: "",
    address: "",
  });
  const [patientDob, setPatientDob] = useState(toUsDate(patient.dob));
  const [patientSex, setPatientSex] = useState<"Male" | "Female" | "Other" | "">(patient.sex ?? "");
  const [maritalStatus, setMaritalStatus] = useState<"Single" | "Married" | "Divorced" | "Widowed" | "Other" | "">(patient.maritalStatus ?? "");
  const [dateOfLoss, setDateOfLoss] = useState(toUsDate(patient.dateOfLoss));
  const [initialExam, setInitialExam] = useState(toUsDate(patient.matrix?.initialExam ?? ""));
  const [patientPhone, setPatientPhone] = useState(formatUsPhoneInput(patient.phone));
  const [patientEmail, setPatientEmail] = useState(patient.email ?? "");
  const [patientAddress, setPatientAddress] = useState(patient.address ?? "");
  const [lienStatus, setLienStatus] = useState(() => {
    const currentLien = patient.matrix?.lien?.trim();
    if (currentLien) {
      return currentLien;
    }
    return lienOptions[0] || "Not Set";
  });
  const [priorCare, setPriorCare] = useState(patient.matrix?.priorCare ?? "");
  const [xrayFindings, setXrayFindings] = useState(patient.matrix?.xrayFindings ?? "");
  const [mriCtFindings, setMriCtFindings] = useState(patient.matrix?.mriCtFindings ?? "");
  const [specialistRecommendations, setSpecialistRecommendations] = useState(
    patient.matrix?.specialistRecommendations ?? "",
  );
  const [patientNotes, setPatientNotes] = useState(patient.matrix?.notes ?? "");
  const [caseStatus, setCaseStatus] = useState<string>(patient.caseStatus);

  const [xray, setXray] = useState<ImagingFormState>({
    sentDate: "",
    center: "",
    regions: [],
    lateralityByRegion: {},
    flexExtRegions: [],
    doneDate: "",
    reportReceivedDate: toUsDate(patient.matrix?.xrayReceived ?? ""),
    reportReviewedDate: toUsDate(patient.matrix?.xrayReviewed ?? ""),
  });
  const [xrayReferrals, setXrayReferrals] = useState<ImagingReferral[]>([]);
  const [xrayMessage, setXrayMessage] = useState("");
  const [editingXrayReferralId, setEditingXrayReferralId] = useState<string | null>(null);

  const [mri, setMri] = useState<ImagingFormState>({
    sentDate: "",
    center: "",
    isCt: false,
    regions: [],
    lateralityByRegion: {},
    flexExtRegions: [],
    doneDate: "",
    reportReceivedDate: toUsDate(patient.matrix?.mriReceived ?? ""),
    reportReviewedDate: toUsDate(patient.matrix?.mriReviewed ?? ""),
  });
  const [mriReferrals, setMriReferrals] = useState<ImagingReferral[]>([]);
  const [mriMessage, setMriMessage] = useState("");
  const [editingMriReferralId, setEditingMriReferralId] = useState<string | null>(null);

  const [specialistDraft, setSpecialistDraft] = useState({
    specialist: "",
    sentDate: "",
  });
  const [specialistReferrals, setSpecialistReferrals] = useState<SpecialistReferral[]>([]);
  const [specialistMessage, setSpecialistMessage] = useState("");
  const [editingSpecialist, setEditingSpecialist] = useState<SpecialistReferral | null>(null);
  const [imagingPanelsOpen, setImagingPanelsOpen] = useState<Record<ImagingPanelKey, boolean>>({
    xray: false,
    mri: false,
    specialist: false,
  });
  const [sectionPanelsOpen, setSectionPanelsOpen] = useState<Record<SectionPanelKey, boolean>>({
    findings: false,
    notes: false,
    reExam: false,
    relatedCases: false,
    quickStats: false,
    appointments: false,
    diagnosis: false,
    letters: false,
    narrative: false,
    additionalDetails: false,
  });
  const quickTaskButtonRef = useRef<HTMLButtonElement | null>(null);
  const attorneyInputRef = useRef<HTMLInputElement | null>(null);
  const [regionModalAnchor, setRegionModalAnchor] = useState<PopupAnchor | null>(null);
  const [attorneyPromptAnchor, setAttorneyPromptAnchor] = useState<PopupAnchor | null>(null);
  const [attorneyFormAnchor, setAttorneyFormAnchor] = useState<PopupAnchor | null>(null);
  const [specialistEditorAnchor, setSpecialistEditorAnchor] = useState<PopupAnchor | null>(null);
  const [quickTaskAnchor, setQuickTaskAnchor] = useState<PopupAnchor | null>(null);
  const [showQuickTaskModal, setShowQuickTaskModal] = useState(false);
  const [quickTaskTitle, setQuickTaskTitle] = useState("");
  const [quickTaskPriority, setQuickTaskPriority] = useState<TaskPriority>("Medium");
  const [quickTaskDueDate, setQuickTaskDueDate] = useState("");
  const [quickTaskModalMessage, setQuickTaskModalMessage] = useState("");
  const [quickTaskStatusMessage, setQuickTaskStatusMessage] = useState("");

  const [reExamDraft, setReExamDraft] = useState("");
  const [reExams, setReExams] = useState<string[]>(
    [patient.matrix?.reExam1, patient.matrix?.reExam2, patient.matrix?.reExam3].filter(
      (value): value is string => Boolean(value?.trim()),
    ),
  );

  const [relatedCaseDraft, setRelatedCaseDraft] = useState("");
  const [relatedCases, setRelatedCases] = useState<RelatedCaseEntry[]>([]);
  const [selectedRelatedPatientId, setSelectedRelatedPatientId] = useState<string | null>(null);
  const [relatedCaseMessage, setRelatedCaseMessage] = useState("");
  const [showRelatedCaseSuggestions, setShowRelatedCaseSuggestions] = useState(false);
  const [relatedCaseNavigateTarget, setRelatedCaseNavigateTarget] = useState<RelatedCaseEntry | null>(null);
  const [relatedCaseNavigateAnchor, setRelatedCaseNavigateAnchor] = useState<PopupAnchor | null>(null);

  const [dischargeDate, setDischargeDate] = useState(toUsDate(patient.matrix?.discharge ?? ""));
  const [rbSentDate, setRbSentDate] = useState(toUsDate(patient.matrix?.rbSent ?? ""));
  const [billedAmount, setBilledAmount] = useState(() => {
    if (patientBillingRecord) {
      return patientBillingRecord.billedAmount.toString();
    }
    return (patient.matrix?.billed ?? "").toString().replace(/[^0-9.]/g, "");
  });
  const [paidDate, setPaidDate] = useState(() =>
    toUsDate(patientBillingRecord?.paidDate ?? patient.matrix?.paidDate ?? ""),
  );
  const [paidAmount, setPaidAmount] = useState(() => {
    if (patientBillingRecord) {
      return patientBillingRecord.paidAmount.toString();
    }
    return (patient.matrix?.paidAmount ?? "").toString().replace(/[^0-9.]/g, "");
  });
  const [reviewStatus, setReviewStatus] = useState(patient.matrix?.review || "Not Requested");
  const [diagnosisMacroIdDraft, setDiagnosisMacroIdDraft] = useState("");
  const [diagnosisBundleIdDraft, setDiagnosisBundleIdDraft] = useState("");
  const [customDiagnosisCodeDraft, setCustomDiagnosisCodeDraft] = useState("");
  const [customDiagnosisDescriptionDraft, setCustomDiagnosisDescriptionDraft] = useState("");
  const [diagnosisMessage, setDiagnosisMessage] = useState("");
  const [letterTemplateIdDraft, setLetterTemplateIdDraft] = useState("");
  const [letterMessage, setLetterMessage] = useState("");
  const [narrativeTemplateIdDraft, setNarrativeTemplateIdDraft] = useState("");
  const [narrativeMessage, setNarrativeMessage] = useState("");
  const [narrativePromptValues, setNarrativePromptValues] = useState<Record<string, string>>({});
  const [narrativePromptTemplateId, setNarrativePromptTemplateId] = useState<string | null>(null);
  const [showNarrativePromptModal, setShowNarrativePromptModal] = useState(false);
  const [narrativePromptError, setNarrativePromptError] = useState("");
  const [narrativePreview, setNarrativePreview] = useState<NarrativePreviewState | null>(null);
  const [showNarrativePreviewModal, setShowNarrativePreviewModal] = useState(false);
  const [encounterMessage, setEncounterMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  const [activeRegionModal, setActiveRegionModal] = useState<ImagingMode | null>(null);
  const [showDiagnosisModal, setShowDiagnosisModal] = useState(false);
  const [diagnosisModalAnchor, setDiagnosisModalAnchor] = useState<PopupAnchor | null>(null);
  const [diagnosisModalTab, setDiagnosisModalTab] = useState<"codes" | "bundles" | "custom">("codes");
  const [diagnosisSearchDraft, setDiagnosisSearchDraft] = useState("");
  const [diagnosisFolderFilter, setDiagnosisFolderFilter] = useState("all");
  const caseNumber = useMemo(
    () => buildCaseNumber(dateOfLoss, lastName, firstName),
    [dateOfLoss, firstName, lastName],
  );
  const mriStudyLabel = mri.isCt ? "CT" : "MRI";
  const toggleImagingPanel = (panel: ImagingPanelKey) => {
    setImagingPanelsOpen((current) => ({
      ...current,
      [panel]: !current[panel],
    }));
  };
  const toggleSectionPanel = (panel: SectionPanelKey) => {
    setSectionPanelsOpen((current) => ({
      ...current,
      [panel]: !current[panel],
    }));
  };
  const appendFindingRegionLabel = (type: "xray" | "mriCt", label: string) => {
    if (type === "xray") {
      setXrayFindings((current) => appendFindingDraftLine(current, `${label}: `));
      return;
    }
    setMriCtFindings((current) => appendFindingDraftLine(current, `${label}: `));
  };
  const availableImagingRegions = useMemo(() => {
    if (!activeRegionModal) {
      return [];
    }
    return imagingRegions.filter((entry) => entry.modalities.includes(activeRegionModal));
  }, [activeRegionModal]);
  const xrayFindingRegionLabels = useMemo(
    () => getUniqueImagingRegionLabels(xrayReferrals, "xray"),
    [xrayReferrals],
  );
  const mriFindingRegionLabels = useMemo(
    () => getUniqueImagingRegionLabels(mriReferrals, "mri"),
    [mriReferrals],
  );
  const xrayFindingsForTemplates = useMemo(
    () => formatFindingsForTemplate(xrayFindings, xrayFindingRegionLabels),
    [xrayFindings, xrayFindingRegionLabels],
  );
  const mriCtFindingsForTemplates = useMemo(
    () => formatFindingsForTemplate(mriCtFindings, mriFindingRegionLabels),
    [mriCtFindings, mriFindingRegionLabels],
  );
  const specialistRecommendationsForTemplates = useMemo(() => {
    const trimmed = specialistRecommendations.trim();
    return trimmed || "-";
  }, [specialistRecommendations]);

  const statusConfig = caseStatuses.find(
    (statusConfigEntry) => statusConfigEntry.name.toLowerCase() === caseStatus.toLowerCase(),
  );
  const statusColor = statusConfig?.color ?? "#0d79bf";
  const patientFollowUpOverride = getPatientFollowUpOverride(patient.id);
  const xrayFollowUpOverride = patientFollowUpOverride.xray;
  const mriCtFollowUpOverride = patientFollowUpOverride.mriCt;
  const specialistFollowUpOverride = patientFollowUpOverride.specialist;
  const resolvedLienStatus = lienStatus.trim() ? lienStatus : lienOptions[0] || "Not Set";
  const lienSelectOptions = useMemo(() => {
    const normalizedCurrent = resolvedLienStatus.trim().toLowerCase();
    const hasCurrentOption = lienOptions.some(
      (option) => option.trim().toLowerCase() === normalizedCurrent,
    );
    if (hasCurrentOption) {
      return lienOptions;
    }
    return [resolvedLienStatus, ...lienOptions];
  }, [lienOptions, resolvedLienStatus]);

  const activeImaging = activeRegionModal === "xray" ? xray : mri;
  const setActiveImaging = activeRegionModal === "xray" ? setXray : setMri;
  const activeDiagnosisMacros = useMemo(
    () => billingMacros.diagnoses.filter((entry) => entry.active),
    [billingMacros.diagnoses],
  );
  const activeDiagnosisBundles = useMemo(
    () => billingMacros.bundles.filter((entry) => entry.active),
    [billingMacros.bundles],
  );
  const diagnosisById = useMemo(
    () => new Map(billingMacros.diagnoses.map((entry) => [entry.id, entry] as const)),
    [billingMacros.diagnoses],
  );
  const diagnosisFolderById = useMemo(
    () => new Map(billingMacros.diagnosisFolders.map((entry) => [entry.id, entry] as const)),
    [billingMacros.diagnosisFolders],
  );
  const filteredDiagnosisMacros = useMemo(() => {
    const query = diagnosisSearchDraft.trim().toLowerCase();
    return activeDiagnosisMacros
      .filter((entry) =>
        diagnosisFolderFilter === "all" ? true : entry.folderId === diagnosisFolderFilter,
      )
      .filter((entry) => {
        if (!query) {
          return true;
        }
        return (
          entry.code.toLowerCase().includes(query) ||
          entry.description.toLowerCase().includes(query)
        );
      })
      .sort((left, right) => left.code.localeCompare(right.code));
  }, [activeDiagnosisMacros, diagnosisFolderFilter, diagnosisSearchDraft]);
  const relatedCaseSuggestions = useMemo(() => {
    const usedPatientIds = new Set(relatedCases.map((entry) => entry.patientId));
    const query = relatedCaseDraft.trim().toLowerCase();

    return allPatients
      .filter((entry) => entry.id !== patient.id)
      .filter((entry) => !usedPatientIds.has(entry.id))
      .filter((entry) => {
        if (!query) {
          return true;
        }
        const dateOfInjury = toUsDate(entry.dateOfLoss).toLowerCase();
        return (
          entry.fullName.toLowerCase().includes(query) ||
          entry.dateOfLoss.toLowerCase().includes(query) ||
          dateOfInjury.includes(query)
        );
      })
      .slice(0, 8);
  }, [patient.id, relatedCaseDraft, relatedCases]);
  const patientEncounterRecords = useMemo(
    () =>
      encountersByNewest
        .filter((entry) => entry.patientId === patient.id)
        .sort(
          (left, right) =>
            toSortStampFromUsDate(right.encounterDate) - toSortStampFromUsDate(left.encounterDate),
        ),
    [encountersByNewest, patient.id],
  );
  const openPatientEncounterRecords = useMemo(
    () =>
      patientEncounterRecords.filter((entry) => !entry.signed).sort(
        (left, right) =>
          toSortStampFromUsDate(right.encounterDate) - toSortStampFromUsDate(left.encounterDate),
      ),
    [patientEncounterRecords],
  );
  const patientAppointmentRecords = useMemo(() => {
    const patientNameLookup = buildPatientNameLookupSet(patient.fullName, firstName, lastName);
    return scheduleAppointments
      .filter(
        (entry) =>
          entry.patientId === patient.id ||
          patientNameLookup.has(normalizeNameForLookup(entry.patientName)),
      )
      .sort((left, right) => {
        const byDate = right.date.localeCompare(left.date);
        if (byDate !== 0) {
          return byDate;
        }
        return right.startTime.localeCompare(left.startTime);
      });
  }, [firstName, lastName, patient.fullName, patient.id, scheduleAppointments]);
  const appointmentRows = useMemo(
    () => {
      type AppointmentEncounterRow = {
        rowId: string;
        dateLabel: string;
        typeLabel: string;
        statusLabel: string;
        appointment: ScheduleAppointmentRecord | null;
        linkedEncounter: (typeof patientEncounterRecords)[number] | null;
      };
      const rows: AppointmentEncounterRow[] = [];
      const matchedEncounterIds = new Set<string>();
      const encounterByDateType = new Map<string, (typeof patientEncounterRecords)[number]>();
      patientEncounterRecords.forEach((encounter) => {
        const key = `${encounter.encounterDate}|${normalizeLookupValue(encounter.appointmentType)}`;
        if (!encounterByDateType.has(key)) {
          encounterByDateType.set(key, encounter);
        }
      });

      patientAppointmentRecords.forEach((appointment) => {
        const appointmentDate = toUsDate(appointment.date);
        const exactTypeMatch =
          encounterByDateType.get(
            `${appointmentDate}|${normalizeLookupValue(appointment.appointmentType)}`,
          ) ?? null;
        const sameDateMatch =
          exactTypeMatch ??
          patientEncounterRecords.find((entry) => entry.encounterDate === appointmentDate) ??
          null;

        if (sameDateMatch) {
          matchedEncounterIds.add(sameDateMatch.id);
        }

        rows.push({
          rowId: `appointment-encounter-row-${appointment.id}`,
          dateLabel: appointmentDate,
          typeLabel: appointment.appointmentType,
          statusLabel: appointment.status,
          appointment,
          linkedEncounter: sameDateMatch,
        });
      });

      patientEncounterRecords.forEach((encounter) => {
        if (matchedEncounterIds.has(encounter.id)) {
          return;
        }
        rows.push({
          rowId: `appointment-encounter-row-encounter-${encounter.id}`,
          dateLabel: encounter.encounterDate,
          typeLabel: encounter.appointmentType || "Encounter",
          statusLabel: encounter.signed ? "Closed (Encounter Only)" : "Open (Encounter Only)",
          appointment: null,
          linkedEncounter: encounter,
        });
      });

      rows.sort((left, right) => {
        const byDate = toSortStampFromUsDate(right.dateLabel) - toSortStampFromUsDate(left.dateLabel);
        if (byDate !== 0) {
          return byDate;
        }
        return left.typeLabel.localeCompare(right.typeLabel);
      });

      return rows;
    },
    [patientAppointmentRecords, patientEncounterRecords],
  );
  const checkedInCount = useMemo(
    () => patientAppointmentRecords.filter((entry) => entry.status === "Check In").length,
    [patientAppointmentRecords],
  );
  const checkedOutCount = useMemo(
    () => patientAppointmentRecords.filter((entry) => entry.status === "Check Out").length,
    [patientAppointmentRecords],
  );
  const checkedInOutCount = checkedInCount + checkedOutCount;
  const noShowCount = useMemo(
    () => patientAppointmentRecords.filter((entry) => entry.status === "No Show").length,
    [patientAppointmentRecords],
  );
  const canceledCount = useMemo(
    () => patientAppointmentRecords.filter((entry) => entry.status === "Canceled").length,
    [patientAppointmentRecords],
  );
  const closedEncounterCount = useMemo(
    () => patientEncounterRecords.filter((entry) => entry.signed).length,
    [patientEncounterRecords],
  );
  const currentBillTotal = useMemo(
    () =>
      patientEncounterRecords.reduce((sum, encounter) => {
        const encounterTotal = encounter.charges.reduce(
          (chargeSum, charge) => chargeSum + charge.unitPrice * charge.units,
          0,
        );
        return sum + encounterTotal;
      }, 0),
    [patientEncounterRecords],
  );
  const quickStatRows = useMemo(
    () => {
      const rows: Array<{
        key: QuickStatOptionKey;
        label: string;
        value: string;
        helper?: string;
      }> = [
        {
          key: "checkedInOut",
          label: "Checked In / Out",
          value: `${checkedInOutCount}`,
          helper: `In ${checkedInCount} • Out ${checkedOutCount}`,
        },
        {
          key: "noShow",
          label: "No Show",
          value: `${noShowCount}`,
        },
        {
          key: "canceled",
          label: "Canceled",
          value: `${canceledCount}`,
        },
        {
          key: "openEncounters",
          label: "Open Encounters",
          value: `${openPatientEncounterRecords.length}`,
        },
        {
          key: "closedEncounters",
          label: "Closed Encounters",
          value: `${closedEncounterCount}`,
        },
        {
          key: "currentBill",
          label: "Current Bill",
          value: formatUsdCurrency(currentBillTotal),
        },
      ];
      return rows.filter((row) => quickStatsSettings.visibleStats[row.key]);
    },
    [
      canceledCount,
      checkedInCount,
      checkedInOutCount,
      checkedOutCount,
      closedEncounterCount,
      currentBillTotal,
      noShowCount,
      openPatientEncounterRecords.length,
      quickStatsSettings.visibleStats,
    ],
  );

  const matchedAttorneyContact = useMemo(
    () =>
      attorneyContacts.find(
        (contact) => normalizeLookupValue(contact.name) === normalizeLookupValue(attorney),
      ) ?? null,
    [attorney, attorneyContacts],
  );
  const specialistReferralTemplate = useMemo(
    () => {
      const specialistTemplates = documentTemplates.templates.filter(
        (template) => template.scope === "specialistReferral",
      );
      return specialistTemplates.find((template) => template.active) ?? specialistTemplates[0] ?? null;
    },
    [documentTemplates.templates],
  );
  const imagingRequestTemplate = useMemo(
    () => {
      const imagingTemplates = documentTemplates.templates.filter(
        (template) => template.scope === "imagingRequest",
      );
      return imagingTemplates.find((template) => template.active) ?? imagingTemplates[0] ?? null;
    },
    [documentTemplates.templates],
  );
  const letterTemplates = useMemo(
    () => documentTemplates.templates.filter((template) => template.scope === "generalLetter"),
    [documentTemplates.templates],
  );
  const availableLetterTemplates = useMemo(() => {
    const activeTemplates = letterTemplates.filter((template) => template.active);
    return activeTemplates.length ? activeTemplates : letterTemplates;
  }, [letterTemplates]);
  const selectedLetterTemplate = useMemo(() => {
    if (letterTemplateIdDraft) {
      const matched = availableLetterTemplates.find((template) => template.id === letterTemplateIdDraft);
      if (matched) {
        return matched;
      }
    }
    return availableLetterTemplates[0] ?? null;
  }, [availableLetterTemplates, letterTemplateIdDraft]);
  const availableNarrativeTemplates = useMemo(() => {
    const activeTemplates = reportTemplates.templates.filter((template) => template.active);
    return activeTemplates.length ? activeTemplates : reportTemplates.templates;
  }, [reportTemplates.templates]);
  const selectedNarrativeTemplate = useMemo(() => {
    if (narrativeTemplateIdDraft) {
      const matched = availableNarrativeTemplates.find((template) => template.id === narrativeTemplateIdDraft);
      if (matched) {
        return matched;
      }
    }
    return availableNarrativeTemplates[0] ?? null;
  }, [availableNarrativeTemplates, narrativeTemplateIdDraft]);
  const narrativePromptTemplate = useMemo(() => {
    if (!narrativePromptTemplateId) {
      return null;
    }
    return reportTemplates.templates.find((template) => template.id === narrativePromptTemplateId) ?? null;
  }, [narrativePromptTemplateId, reportTemplates.templates]);
  const attorneyPhone = matchedAttorneyContact?.phone ?? "";

  const openTemplateSettings = (scope: DocumentTemplateScope) => {
    router.push(`/settings?section=documents&scope=${scope}`);
  };

  const closeQuickTaskModal = () => {
    setShowQuickTaskModal(false);
    setQuickTaskAnchor(null);
    setQuickTaskModalMessage("");
  };

  const openQuickTaskModal = (event?: MouseEvent<HTMLElement>) => {
    const defaultTitle = caseNumber
      ? `Follow up: ${patient.fullName} (${caseNumber})`
      : `Follow up: ${patient.fullName}`;
    setQuickTaskTitle(defaultTitle);
    setQuickTaskPriority("Medium");
    setQuickTaskDueDate("");
    setQuickTaskModalMessage("");
    setQuickTaskStatusMessage("");
    setQuickTaskAnchor(
      event ? getPopupAnchorFromEvent(event) : getPopupAnchorFromElement(quickTaskButtonRef.current),
    );
    setShowQuickTaskModal(true);
  };

  const saveQuickTask = () => {
    const dueDateIso = quickTaskDueDate.trim() ? toIsoDateFromUsDate(quickTaskDueDate) : "";
    if (quickTaskDueDate.trim() && !dueDateIso) {
      setQuickTaskModalMessage("Enter due date as MM/DD/YYYY.");
      return;
    }
    const result = addTask({
      title: quickTaskTitle,
      priority: quickTaskPriority,
      dueDate: dueDateIso,
    });
    if (!result.added) {
      setQuickTaskModalMessage(result.reason);
      return;
    }
    setQuickTaskStatusMessage("Task added to My Tasks.");
    closeQuickTaskModal();
  };

  const openReportTemplateSettings = () => {
    router.push("/settings?section=reports");
  };

  const getCommonDocumentContext = (): Record<string, string> => {
    const patientFullName = `${firstName} ${lastName}`.trim();
    return {
      TODAY_DATE: getTodayUsDate(),
      OFFICE_NAME: officeSettings.officeName,
      OFFICE_ADDRESS: officeSettings.address,
      OFFICE_PHONE: officeSettings.phone,
      OFFICE_FAX: officeSettings.fax,
      OFFICE_EMAIL: officeSettings.email,
      DOCTOR_NAME: officeSettings.doctorName,
      PATIENT_FULL_NAME: patientFullName,
      PATIENT_FIRST_NAME: firstName,
      PATIENT_LAST_NAME: lastName,
      PATIENT_DOB: patientDob,
      DATE_OF_INJURY: dateOfLoss,
      PATIENT_PHONE: patientPhone,
      PATIENT_EMAIL: patientEmail,
      CASE_NUMBER: caseNumber,
      ATTORNEY_NAME: attorney,
      ATTORNEY_PHONE: matchedAttorneyContact?.phone ?? "",
      ATTORNEY_FAX: matchedAttorneyContact?.fax ?? "",
      ATTORNEY_EMAIL: matchedAttorneyContact?.email ?? "",
      ATTORNEY_ADDRESS: matchedAttorneyContact?.address ?? "",
      SPECIALIST_NAME: "",
      SPECIALIST_PHONE: "",
      SPECIALIST_FAX: "",
      SPECIALIST_EMAIL: "",
      SPECIALIST_ADDRESS: "",
      REFERRAL_SENT_DATE: "",
      REFERRAL_SCHEDULED_DATE: "",
      IMAGING_TYPE: "",
      IMAGING_CENTER: "",
      IMAGING_REGIONS: "",
      IMAGING_SENT_DATE: "",
      IMAGING_DONE_DATE: "",
      IMAGING_REPORT_RECEIVED_DATE: "",
      IMAGING_REPORT_REVIEWED_DATE: "",
      XRAY_FINDINGS: xrayFindingsForTemplates,
      MRI_CT_FINDINGS: mriCtFindingsForTemplates,
      SPECIALIST_RECOMMENDATIONS: specialistRecommendationsForTemplates,
    };
  };

  const handleAttorneyChange = (nextValue: string) => {
    setAttorney(nextValue);
    setAttorneyModalError("");
    if (showAddAttorneyPrompt || showAddAttorneyForm) {
      setShowAddAttorneyPrompt(false);
      setShowAddAttorneyForm(false);
      setAttorneyPromptAnchor(null);
      setAttorneyFormAnchor(null);
    }
  };

  const handleAttorneyBlur = () => {
    const trimmed = attorney.trim();
    if (!trimmed) {
      return;
    }
    if (normalizeLookupValue(trimmed) === "self") {
      return;
    }
    if (matchedAttorneyContact) {
      return;
    }
    const isDismissed = dismissedAttorneyDrafts.some(
      (entry) => normalizeLookupValue(entry) === normalizeLookupValue(trimmed),
    );
    if (isDismissed) {
      return;
    }
    setNewAttorneyDraft({
      name: trimmed,
      phone: "",
      fax: "",
      email: "",
      address: "",
    });
    setAttorneyPromptAnchor(getPopupAnchorFromElement(attorneyInputRef.current));
    setShowAddAttorneyPrompt(true);
  };

  const openAttorneyForm = (event?: MouseEvent<HTMLElement>) => {
    setAttorneyModalError("");
    setShowAddAttorneyPrompt(false);
    setAttorneyPromptAnchor(null);
    setAttorneyFormAnchor(event ? getPopupAnchorFromEvent(event) : attorneyPromptAnchor);
    setShowAddAttorneyForm(true);
  };

  const dismissAttorneyPrompt = () => {
    const trimmed = attorney.trim();
    if (trimmed) {
      setDismissedAttorneyDrafts((current) =>
        current.some((entry) => normalizeLookupValue(entry) === normalizeLookupValue(trimmed))
          ? current
          : [...current, trimmed],
      );
    }
    setShowAddAttorneyPrompt(false);
    setAttorneyPromptAnchor(null);
  };

  const saveAttorneyContact = () => {
    const result = addContact({
      name: newAttorneyDraft.name,
      category: "Attorney",
      phone: newAttorneyDraft.phone,
      fax: newAttorneyDraft.fax,
      email: newAttorneyDraft.email,
      address: newAttorneyDraft.address,
    });

    if (!result.added) {
      if (result.contact) {
        setAttorney(result.contact.name);
        setShowAddAttorneyForm(false);
        setAttorneyFormAnchor(null);
        return;
      }
      setAttorneyModalError(result.reason ?? "Could not add attorney contact.");
      return;
    }

    setAttorney(result.contact.name);
    setDismissedAttorneyDrafts((current) =>
      current.filter(
        (entry) => normalizeLookupValue(entry) !== normalizeLookupValue(result.contact.name),
      ),
    );
    setShowAddAttorneyForm(false);
    setAttorneyFormAnchor(null);
    setAttorneyModalError("");
  };

  const clearImagingDraft = (mode: ImagingMode) => {
    if (mode === "xray") {
      setXray(emptyImagingFormState("xray"));
      return;
    }
    setMri(emptyImagingFormState("mri"));
  };

  const saveImagingReferral = (mode: ImagingMode) => {
    const draft = mode === "xray" ? xray : mri;
    const setMessage = mode === "xray" ? setXrayMessage : setMriMessage;
    const editingId = mode === "xray" ? editingXrayReferralId : editingMriReferralId;
    const setEditingId = mode === "xray" ? setEditingXrayReferralId : setEditingMriReferralId;
    const setReferrals = mode === "xray" ? setXrayReferrals : setMriReferrals;
    const label = mode === "xray" ? "X-Ray" : draft.isCt ? "CT" : "MRI";

    if (!draft.sentDate.trim()) {
      setMessage("Sent Date is required.");
      return;
    }
    if (!draft.center.trim()) {
      setMessage("Imaging Center is required.");
      return;
    }
    if (!draft.regions.length) {
      setMessage("Select at least one region.");
      return;
    }

    const nextEntry: ImagingReferral = {
      id: editingId ?? `${mode}-${Date.now()}`,
      modalityLabel: label,
      ...cloneImagingFormState(draft),
    };

    setReferrals((current) => {
      const nextReferrals = !editingId
        ? [...current, nextEntry]
        : current.map((entry) => (entry.id === editingId ? nextEntry : entry));

      // Persist imaging data to patient matrix
      const sentDateIso = toIsoDateFromUsDate(nextEntry.sentDate);
      const doneDateIso = toIsoDateFromUsDate(nextEntry.doneDate ?? "");
      const receivedDateIso = toIsoDateFromUsDate(nextEntry.reportReceivedDate ?? "");
      const reviewedDateIso = toIsoDateFromUsDate(nextEntry.reportReviewedDate ?? "");

      if (mode === "xray") {
        updatePatientRecordById(patient.id, {
          lastUpdate: new Date().toISOString().slice(0, 10),
          matrix: {
            xraySent: sentDateIso,
            xrayDone: doneDateIso,
            xrayReceived: receivedDateIso,
            xrayReviewed: reviewedDateIso,
          },
        });
      } else {
        updatePatientRecordById(patient.id, {
          lastUpdate: new Date().toISOString().slice(0, 10),
          matrix: {
            mriSent: sentDateIso,
            mriDone: doneDateIso,
            mriReceived: receivedDateIso,
            mriReviewed: reviewedDateIso,
          },
        });
      }

      return nextReferrals;
    });

    setMessage(editingId ? `${label} sent entry updated.` : `${label} sent entry added.`);
    setEditingId(null);
    clearImagingDraft(mode);
  };

  const editImagingReferral = (mode: ImagingMode, referralId: string) => {
    const referrals = mode === "xray" ? xrayReferrals : mriReferrals;
    const setDraft = mode === "xray" ? setXray : setMri;
    const setEditingId = mode === "xray" ? setEditingXrayReferralId : setEditingMriReferralId;
    const setMessage = mode === "xray" ? setXrayMessage : setMriMessage;
    const entry = referrals.find((item) => item.id === referralId);
    if (!entry) {
      return;
    }
    setDraft(cloneImagingFormState(entry));
    setEditingId(referralId);
    setMessage(`Editing ${entry.modalityLabel} entry from ${entry.sentDate}.`);
    setImagingPanelsOpen((current) => ({ ...current, [mode]: true }));
  };

  const cancelImagingReferralEdit = (mode: ImagingMode) => {
    const setEditingId = mode === "xray" ? setEditingXrayReferralId : setEditingMriReferralId;
    const setMessage = mode === "xray" ? setXrayMessage : setMriMessage;
    clearImagingDraft(mode);
    setEditingId(null);
    setMessage("");
  };

  const removeImagingReferral = (mode: ImagingMode, referralId: string) => {
    const setReferrals = mode === "xray" ? setXrayReferrals : setMriReferrals;
    const setEditingId = mode === "xray" ? setEditingXrayReferralId : setEditingMriReferralId;
    const editingId = mode === "xray" ? editingXrayReferralId : editingMriReferralId;
    const setMessage = mode === "xray" ? setXrayMessage : setMriMessage;

    setReferrals((current) => current.filter((entry) => entry.id !== referralId));
    if (editingId === referralId) {
      setEditingId(null);
      clearImagingDraft(mode);
    }
    setMessage("Sent entry removed.");
  };

  const addSpecialist = () => {
    const specialistName = specialistDraft.specialist.trim();
    if (!specialistName || !specialistDraft.sentDate.trim()) {
      setSpecialistMessage("Specialist and Sent Date are required.");
      return;
    }
    const newItem: SpecialistReferral = {
      id: `sp-${Date.now()}`,
      specialist: specialistName,
      sentDate: specialistDraft.sentDate,
      scheduledDate: "",
      reportReceivedDate: "",
    };
    setSpecialistReferrals((current) => [...current, newItem]);
    setSpecialistDraft({
      specialist: "",
      sentDate: "",
    });
    setSpecialistMessage(`${specialistName} added. Use Edit to update scheduling/report status.`);
  };

  const openSpecialistEditor = (entry: SpecialistReferral, event?: MouseEvent<HTMLElement>) => {
    setEditingSpecialist({ ...entry });
    setSpecialistEditorAnchor(event ? getPopupAnchorFromEvent(event) : null);
  };

  const saveSpecialistEditor = () => {
    if (!editingSpecialist) {
      return;
    }
    if (!editingSpecialist.specialist.trim() || !editingSpecialist.sentDate.trim()) {
      setSpecialistMessage("Specialist and Sent Date are required.");
      return;
    }
    setSpecialistReferrals((current) =>
      current.map((entry) => (entry.id === editingSpecialist.id ? editingSpecialist : entry)),
    );
    setSpecialistMessage(`${editingSpecialist.specialist} updated.`);
    setEditingSpecialist(null);
    setSpecialistEditorAnchor(null);
  };

  const removeSpecialist = (id: string) => {
    setSpecialistReferrals((current) => current.filter((entry) => entry.id !== id));
    setSpecialistMessage("Specialist referral removed.");
  };

  const generateSpecialistReferralPdf = (entry: SpecialistReferral) => {
    if (!specialistReferralTemplate) {
      setSpecialistMessage("NO PDF. Create Template?");
      const shouldCreate = window.confirm("NO PDF. Create Template?");
      if (shouldCreate) {
        openTemplateSettings("specialistReferral");
      }
      return;
    }

    const specialistContact =
      specialistContactDirectory.find(
        (contact) => normalizeLookupValue(contact.name) === normalizeLookupValue(entry.specialist),
      ) ?? null;

    const context: Record<string, string> = {
      ...getCommonDocumentContext(),
      SPECIALIST_NAME: entry.specialist,
      SPECIALIST_PHONE: specialistContact?.phone ?? "",
      SPECIALIST_FAX: specialistContact?.fax ?? "",
      SPECIALIST_EMAIL: specialistContact?.email ?? "",
      SPECIALIST_ADDRESS: specialistContact?.address ?? "",
      REFERRAL_SENT_DATE: entry.sentDate,
      REFERRAL_SCHEDULED_DATE: entry.scheduledDate,
    };

    const renderedHeader = documentTemplates.header.active
      ? renderDocumentTemplate(documentTemplates.header.body, context)
      : "";
    const renderedBody = renderDocumentTemplate(specialistReferralTemplate.body, context);
    const printableHtml = buildPrintableDocumentHtml({
      title: specialistReferralTemplate.name,
      headerHtml: renderedHeader,
      bodyHtml: renderedBody,
      headerFontFamily: documentTemplates.header.fontFamily,
      fontFamily: specialistReferralTemplate.fontFamily,
      includeLogo: documentTemplates.header.active
        ? documentTemplates.header.showOfficeLogo
        : specialistReferralTemplate.showOfficeLogo,
      logoDataUrl: officeSettings.logoDataUrl,
    });

    const printStarted = printHtmlWithIframeFallback(printableHtml);
    if (!printStarted) {
      setSpecialistMessage("Could not open print preview. Check popup/browser print settings and try again.");
      return;
    }

    setSpecialistMessage(
      `Generated ${specialistReferralTemplate.name} for ${entry.specialist}. Use Save as PDF in the print dialog.`,
    );
  };

  const generateImagingRequestPdf = (mode: ImagingMode, entry: ImagingReferral) => {
    const setMessage = mode === "xray" ? setXrayMessage : setMriMessage;
    if (!imagingRequestTemplate) {
      setMessage("NO PDF. Create Template?");
      const shouldCreate = window.confirm("NO PDF. Create Template?");
      if (shouldCreate) {
        openTemplateSettings("imagingRequest");
      }
      return;
    }

    const context: Record<string, string> = {
      ...getCommonDocumentContext(),
      IMAGING_TYPE: entry.modalityLabel,
      IMAGING_CENTER: entry.center,
      IMAGING_REGIONS: formatImagingRegionsSummary(entry, mode),
      IMAGING_SENT_DATE: entry.sentDate,
      IMAGING_DONE_DATE: entry.doneDate,
      IMAGING_REPORT_RECEIVED_DATE: entry.reportReceivedDate,
      IMAGING_REPORT_REVIEWED_DATE: entry.reportReviewedDate,
      REFERRAL_SENT_DATE: entry.sentDate,
    };

    const renderedHeader = documentTemplates.header.active
      ? renderDocumentTemplate(documentTemplates.header.body, context)
      : "";
    const renderedBody = renderDocumentTemplate(imagingRequestTemplate.body, context);
    const printableHtml = buildPrintableDocumentHtml({
      title: imagingRequestTemplate.name,
      headerHtml: renderedHeader,
      bodyHtml: renderedBody,
      headerFontFamily: documentTemplates.header.fontFamily,
      fontFamily: imagingRequestTemplate.fontFamily,
      includeLogo: documentTemplates.header.active
        ? documentTemplates.header.showOfficeLogo
        : imagingRequestTemplate.showOfficeLogo,
      logoDataUrl: officeSettings.logoDataUrl,
    });

    const printStarted = printHtmlWithIframeFallback(printableHtml);
    if (!printStarted) {
      setMessage("Could not open print preview. Check popup/browser print settings and try again.");
      return;
    }

    setMessage(
      `Generated ${imagingRequestTemplate.name} for ${entry.modalityLabel}. Use Save as PDF in the print dialog.`,
    );
  };

  const generateLetterPdf = () => {
    if (!selectedLetterTemplate) {
      setLetterMessage("NO PDF. Create Template?");
      const shouldCreate = window.confirm("NO PDF. Create Template?");
      if (shouldCreate) {
        openTemplateSettings("generalLetter");
      }
      return;
    }

    const context: Record<string, string> = {
      ...getCommonDocumentContext(),
    };

    const renderedHeader = documentTemplates.header.active
      ? renderDocumentTemplate(documentTemplates.header.body, context)
      : "";
    const renderedBody = renderDocumentTemplate(selectedLetterTemplate.body, context);
    const printableHtml = buildPrintableDocumentHtml({
      title: selectedLetterTemplate.name,
      headerHtml: renderedHeader,
      bodyHtml: renderedBody,
      headerFontFamily: documentTemplates.header.fontFamily,
      fontFamily: selectedLetterTemplate.fontFamily,
      includeLogo: documentTemplates.header.active
        ? documentTemplates.header.showOfficeLogo
        : selectedLetterTemplate.showOfficeLogo,
      logoDataUrl: officeSettings.logoDataUrl,
    });

    const printStarted = printHtmlWithIframeFallback(printableHtml);
    if (!printStarted) {
      setLetterMessage("Could not open print preview. Check popup/browser print settings and try again.");
      return;
    }

    setLetterMessage(
      `Generated ${selectedLetterTemplate.name}. Use Save as PDF in the print dialog.`,
    );
  };

  const buildNarrativePreview = (
    template: NonNullable<typeof selectedNarrativeTemplate>,
    promptValues: Record<string, string>,
  ) => {
    const context = buildNarrativeReportContext({
      office: {
        officeName: officeSettings.officeName,
        address: officeSettings.address,
        phone: officeSettings.phone,
        fax: officeSettings.fax,
        email: officeSettings.email,
        doctorName: officeSettings.doctorName,
      },
      patient: {
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`.trim(),
        dob: patientDob,
        dateOfLoss,
        initialExam,
        phone: patientPhone,
        email: patientEmail,
        caseNumber,
        attorney,
        attorneyPhone: matchedAttorneyContact?.phone ?? "",
        attorneyFax: matchedAttorneyContact?.fax ?? "",
        attorneyEmail: matchedAttorneyContact?.email ?? "",
        attorneyAddress: matchedAttorneyContact?.address ?? "",
        caseStatus,
        lienStatus: resolvedLienStatus,
        priorCare,
        patientNotes,
        xrayFindings: xrayFindingsForTemplates,
        mriCtFindings: mriCtFindingsForTemplates,
        specialistRecommendations: specialistRecommendationsForTemplates,
      },
      additional: {
        dischargeDate,
        rbSentDate,
        paidDate,
        billedAmount,
        paidAmount,
        reviewStatus,
      },
      encounters: patientEncounterRecords,
      diagnoses: patientDiagnoses.map((entry) => ({
        code: entry.code,
        description: entry.description,
      })),
      xrayReferrals: xrayReferrals.map((entry) => ({
        modalityLabel: entry.modalityLabel,
        sentDate: entry.sentDate,
        center: entry.center,
        regions: entry.regions,
        lateralityByRegion: entry.lateralityByRegion,
        flexExtRegions: entry.flexExtRegions,
        doneDate: entry.doneDate,
        reportReceivedDate: entry.reportReceivedDate,
        reportReviewedDate: entry.reportReviewedDate,
      })),
      mriReferrals: mriReferrals.map((entry) => ({
        modalityLabel: entry.modalityLabel,
        sentDate: entry.sentDate,
        center: entry.center,
        regions: entry.regions,
        lateralityByRegion: entry.lateralityByRegion,
        flexExtRegions: entry.flexExtRegions,
        doneDate: entry.doneDate,
        reportReceivedDate: entry.reportReceivedDate,
        reportReviewedDate: entry.reportReviewedDate,
      })),
      specialistReferrals: specialistReferrals.map((entry) => ({
        specialist: entry.specialist,
        sentDate: entry.sentDate,
        scheduledDate: entry.scheduledDate,
        reportReceivedDate: entry.reportReceivedDate,
      })),
      promptValues,
    });

    const renderedHeader = documentTemplates.header.active
      ? renderDocumentTemplate(documentTemplates.header.body, context)
      : "";
    const renderedBody = renderNarrativeReportBody(template.body, context);
    return {
      title: template.name,
      fontFamily: template.fontFamily,
      headerHtml: renderedHeader,
      bodyHtml: renderedBody,
    };
  };

  const startNarrativeGeneration = () => {
    if (!selectedNarrativeTemplate) {
      setNarrativeMessage("NO PDF. Create Template?");
      const shouldCreate = window.confirm("NO PDF. Create Template?");
      if (shouldCreate) {
        openReportTemplateSettings();
      }
      return;
    }

    if (selectedNarrativeTemplate.prompts.length) {
      const defaults = selectedNarrativeTemplate.prompts.reduce<Record<string, string>>(
        (accumulator, prompt) => {
          accumulator[prompt.token] = "";
          return accumulator;
        },
        {},
      );
      setNarrativePromptValues(defaults);
      setNarrativePromptTemplateId(selectedNarrativeTemplate.id);
      setNarrativePromptError("");
      setShowNarrativePromptModal(true);
      return;
    }

    const preview = buildNarrativePreview(selectedNarrativeTemplate, {});
    setNarrativePreview(preview);
    setShowNarrativePreviewModal(true);
    setNarrativeMessage(`Generated ${selectedNarrativeTemplate.name} preview. Review and print when ready.`);
  };

  const continueNarrativeGeneration = () => {
    if (!narrativePromptTemplate) {
      setNarrativePromptError("Template not found. Please try again.");
      return;
    }

    const missingPrompt = narrativePromptTemplate.prompts.find(
      (prompt) => prompt.required && !narrativePromptValues[prompt.token]?.trim(),
    );
    if (missingPrompt) {
      setNarrativePromptError(`"${missingPrompt.label}" is required.`);
      return;
    }

    const preview = buildNarrativePreview(narrativePromptTemplate, narrativePromptValues);
    setNarrativePreview(preview);
    setShowNarrativePromptModal(false);
    setShowNarrativePreviewModal(true);
    setNarrativePromptTemplateId(null);
    setNarrativePromptError("");
    setNarrativeMessage(`Generated ${narrativePromptTemplate.name} preview. Review and print when ready.`);
  };

  const closeNarrativePromptModal = () => {
    setShowNarrativePromptModal(false);
    setNarrativePromptTemplateId(null);
    setNarrativePromptError("");
    setNarrativePromptValues({});
  };

  const printNarrativePreview = () => {
    if (!narrativePreview) {
      setNarrativeMessage("Generate a narrative preview first.");
      return;
    }

    const printableHtml = buildPrintableDocumentHtml({
      title: narrativePreview.title,
      headerHtml: narrativePreview.headerHtml,
      bodyHtml: narrativePreview.bodyHtml,
      headerFontFamily: documentTemplates.header.fontFamily,
      fontFamily: narrativePreview.fontFamily,
      includeLogo: documentTemplates.header.active
        ? documentTemplates.header.showOfficeLogo
        : true,
      logoDataUrl: officeSettings.logoDataUrl,
    });

    const printStarted = printHtmlWithIframeFallback(printableHtml);
    if (!printStarted) {
      setNarrativeMessage("Could not open print preview. Check popup/browser print settings and try again.");
      return;
    }

    setNarrativeMessage(
      `Generated ${narrativePreview.title}. Use Save as PDF in the print dialog.`,
    );
  };

  const closeNarrativePreviewModal = () => {
    setShowNarrativePreviewModal(false);
    setNarrativePreview(null);
  };

  const addReExam = () => {
    if (!reExamDraft) {
      return;
    }
    setReExams((current) => [...current, reExamDraft]);
    setReExamDraft("");
  };

  const removeReExam = (targetIndex: number) => {
    setReExams((current) => current.filter((_, index) => index !== targetIndex));
  };

  const addRelatedCase = () => {
    const targetPatient =
      allPatients.find((entry) => entry.id === selectedRelatedPatientId) ??
      allPatients.find((entry) => entry.fullName.toLowerCase() === relatedCaseDraft.trim().toLowerCase());

    if (!targetPatient) {
      setRelatedCaseMessage("Select a patient from search results.");
      return;
    }
    if (targetPatient.id === patient.id) {
      setRelatedCaseMessage("This patient cannot be related to themself.");
      return;
    }
    if (relatedCases.some((entry) => entry.patientId === targetPatient.id)) {
      setRelatedCaseMessage("This related case is already linked.");
      return;
    }

    setRelatedCases((current) => [
      ...current,
      {
        patientId: targetPatient.id,
        fullName: targetPatient.fullName,
        dateOfLoss: targetPatient.dateOfLoss,
      },
    ]);
    setRelatedCaseDraft("");
    setSelectedRelatedPatientId(null);
    setRelatedCaseMessage("");
    setShowRelatedCaseSuggestions(false);
  };

  const removeRelatedCase = (patientId: string) => {
    setRelatedCases((current) => current.filter((entry) => entry.patientId !== patientId));
  };

  const openRelatedCaseNavigatePrompt = (entry: RelatedCaseEntry, event?: MouseEvent<HTMLElement>) => {
    setRelatedCaseNavigateTarget(entry);
    setRelatedCaseNavigateAnchor(event ? getPopupAnchorFromEvent(event) : null);
  };

  const closeRelatedCaseNavigatePrompt = () => {
    setRelatedCaseNavigateTarget(null);
    setRelatedCaseNavigateAnchor(null);
  };

  const confirmRelatedCaseNavigation = () => {
    if (!relatedCaseNavigateTarget) {
      return;
    }
    router.push(`/patients/${relatedCaseNavigateTarget.patientId}`);
    closeRelatedCaseNavigatePrompt();
  };

  const openEncounterEditor = (encounterId: string) => {
    router.push(`/encounters?patientId=${patient.id}&encounterId=${encounterId}`);
  };

  const createEncounterFromAppointment = (appointment: ScheduleAppointmentRecord) => {
    const appointmentDate = toUsDate(appointment.date);
    const existingEncounter =
      patientEncounterRecords.find((entry) => entry.encounterDate === appointmentDate) ?? null;

    if (existingEncounter) {
      setEncounterMessage(`Opened existing encounter on ${existingEncounter.encounterDate}.`);
      openEncounterEditor(existingEncounter.id);
      return;
    }

    const patientDisplayName = `${lastName.trim()}, ${firstName.trim()}`
      .replace(/^,\s*|,\s*$/g, "")
      .trim();
    const newEncounterId = createEncounter({
      patientId: patient.id,
      patientName: patientDisplayName || patient.fullName,
      provider: appointment.provider || "Galstyan, Mike (Dr. Mike)",
      appointmentType: appointment.appointmentType || "Personal Injury Office Visit",
      encounterDate: appointmentDate,
    });

    if (!newEncounterId) {
      setEncounterMessage("Could not create encounter. Verify appointment details and try again.");
      return;
    }

    const selectedSections = encounterSections.filter((section) => macroLibrary.saltDefaults.sections[section]);
    if (macroLibrary.saltDefaults.enabled && selectedSections.length > 0) {
      const sourceEncounter =
        patientEncounterRecords.find((entry) =>
          selectedSections.some((section) => entry.soap[section].trim().length > 0),
        ) ?? null;

      if (sourceEncounter) {
        let copiedCount = 0;
        selectedSections.forEach((section) => {
          const sourceText = sourceEncounter.soap[section].trim();
          if (!sourceText) {
            return;
          }
          setSoapSection(newEncounterId, section, sourceText);
          copiedCount += 1;
        });
        if (copiedCount > 0) {
          setEncounterMessage(
            `Encounter created for ${appointmentDate}. SALT copied ${copiedCount} section(s) from ${sourceEncounter.encounterDate}.`,
          );
        } else {
          setEncounterMessage(`Encounter created for ${appointmentDate}.`);
        }
      } else {
        setEncounterMessage(`Encounter created for ${appointmentDate}.`);
      }
    } else {
      setEncounterMessage(`Encounter created for ${appointmentDate}.`);
    }

    openEncounterEditor(newEncounterId);
  };

  const savePatientFile = () => {
    const billedValue = Number.parseFloat(billedAmount);
    const paidValue = Number.parseFloat(paidAmount);
    setPatientBillingCoreFields(patient.id, {
      billedAmount: Number.isFinite(billedValue) ? billedValue : 0,
      paidAmount: Number.isFinite(paidValue) ? paidValue : 0,
      paidDate,
    });

    const nextFirstName = firstName.trim();
    const nextLastName = lastName.trim();
    const nextFullName =
      nextFirstName || nextLastName
        ? `${nextLastName || names.lastName}, ${nextFirstName || names.firstName}`
        : patient.fullName;

    const savedPatient = updatePatientRecordById(patient.id, {
      fullName: nextFullName,
      dob: toIsoDateFromUsDate(patientDob),
      sex: patientSex || undefined,
      maritalStatus: maritalStatus || undefined,
      dateOfLoss: toIsoDateFromUsDate(dateOfLoss) || patient.dateOfLoss,
      attorney: attorney.trim() || "Self",
      phone: formatUsPhoneInput(patientPhone) || "-",
      email: patientEmail.trim(),
      address: patientAddress.trim(),
      caseStatus: caseStatus as PatientRecord["caseStatus"],
      lastUpdate: new Date().toISOString().slice(0, 10),
      matrix: {
        initialExam: toIsoDateFromUsDate(initialExam),
        lien: resolvedLienStatus,
        priorCare: priorCare.trim(),
        xrayFindings: xrayFindings.trim(),
        mriCtFindings: mriCtFindings.trim(),
        specialistRecommendations: specialistRecommendations.trim(),
        notes: patientNotes.trim(),
        discharge: toIsoDateFromUsDate(dischargeDate),
        rbSent: toIsoDateFromUsDate(rbSentDate),
      },
    });

    setSaveMessage(savedPatient ? "Saved." : "Could not save patient record.");
  };

  const saveAndClosePatientFile = () => {
    savePatientFile();
    router.push("/patients");
  };

  const addDiagnosisFromMacro = () => {
    const targetId = diagnosisMacroIdDraft || activeDiagnosisMacros[0]?.id;
    if (!targetId) {
      setDiagnosisMessage("Create diagnosis macros in Settings > Billing Macro Settings first.");
      return;
    }
    const macro = activeDiagnosisMacros.find((entry) => entry.id === targetId);
    if (!macro) {
      setDiagnosisMessage("Selected diagnosis macro is not available.");
      return;
    }
    const wasAdded = addDiagnosis(macro.code, macro.description, "Diagnosis Macro");
    setDiagnosisMessage(wasAdded ? `${macro.code} added to patient file.` : `${macro.code} already exists in this patient file.`);
  };

  const addDiagnosisBundle = () => {
    const targetId = diagnosisBundleIdDraft || activeDiagnosisBundles[0]?.id;
    if (!targetId) {
      setDiagnosisMessage("Create diagnosis bundles in Settings > Billing Macro Settings first.");
      return;
    }
    const bundle = activeDiagnosisBundles.find((entry) => entry.id === targetId);
    if (!bundle) {
      setDiagnosisMessage("Selected diagnosis bundle is not available.");
      return;
    }

    const items = bundle.diagnosisIds
      .map((diagnosisId) => diagnosisById.get(diagnosisId))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .map((entry) => ({
        code: entry.code,
        description: entry.description,
        source: `Bundle: ${bundle.name}`,
      }));

    const addedCount = addBulkDiagnoses(items);
    setDiagnosisMessage(
      addedCount
        ? `${addedCount} diagnosis code${addedCount === 1 ? "" : "s"} added from "${bundle.name}".`
        : `All diagnosis codes from "${bundle.name}" are already in this patient file.`,
    );
  };

  const addCustomDiagnosis = () => {
    const wasAdded = addDiagnosis(customDiagnosisCodeDraft, customDiagnosisDescriptionDraft, "Manual");
    if (!wasAdded) {
      setDiagnosisMessage("Enter diagnosis code + description. Duplicate entries are skipped.");
      return;
    }
    setCustomDiagnosisCodeDraft("");
    setCustomDiagnosisDescriptionDraft("");
    setDiagnosisMessage("Custom diagnosis code added to patient file.");
  };

  const initialExamDateValue = parseUsDate(initialExam);
  const dischargeDateValue = parseUsDate(dischargeDate);
  const rbSentDateValue = parseUsDate(rbSentDate);
  const paidDateValue = parseUsDate(paidDate);

  const initialToDischarge = formatMonthDayDiff(
    initialExamDateValue && dischargeDateValue
      ? getMonthDayDiff(initialExamDateValue, dischargeDateValue)
      : null,
  );
  const dischargeToRb = formatMonthDayDiff(
    dischargeDateValue && rbSentDateValue ? getMonthDayDiff(dischargeDateValue, rbSentDateValue) : null,
  );
  const rbToPaid = formatMonthDayDiff(
    rbSentDateValue && paidDateValue ? getMonthDayDiff(rbSentDateValue, paidDateValue) : null,
  );
  const billedAmountValue = Number.parseFloat(billedAmount);
  const paidAmountValue = Number.parseFloat(paidAmount);
  const closeoutAdjustmentTotal = (patientBillingRecord?.adjustments ?? []).reduce(
    (sum, entry) => sum + entry.amount,
    0,
  );
  const percentagePaid =
    Number.isFinite(billedAmountValue) &&
    billedAmountValue > 0 &&
    Number.isFinite(paidAmountValue) &&
    paidAmountValue >= 0
      ? (paidAmountValue / billedAmountValue) * 100
      : null;
  const balanceDue =
    Number.isFinite(billedAmountValue) && billedAmountValue >= 0
      ? billedAmountValue -
        (Number.isFinite(paidAmountValue) && paidAmountValue >= 0 ? paidAmountValue : 0) -
        closeoutAdjustmentTotal
      : null;

  return (
    <div className="space-y-5">
      <section className="panel-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm text-[var(--text-muted)]">
              <Link href="/patients" className="underline">
                Patients
              </Link>{" "}
              / Patient File
            </p>
            <h2 className="text-2xl font-semibold">{patient.fullName}</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Case profile only. SOAP charting is kept in the Encounters module.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                className="inline-flex items-center rounded-lg border border-[var(--line-soft)] bg-white px-3 py-1.5 text-sm font-semibold"
                href={`/encounters?patientId=${patient.id}`}
              >
                Open Encounters For This Patient
              </Link>
              <button
                className="inline-flex items-center rounded-lg border border-[var(--line-soft)] bg-white px-3 py-1.5 text-sm font-semibold"
                onClick={(event) => openQuickTaskModal(event)}
                ref={quickTaskButtonRef}
                type="button"
              >
                + Task
              </button>
            </div>
            {quickTaskStatusMessage && (
              <p className="text-sm font-semibold text-[var(--brand-primary)]">{quickTaskStatusMessage}</p>
            )}
          </div>
          <span
            className="status-pill"
            style={{
              backgroundColor: withAlpha(statusColor, 0.2),
              color: getContrastTextColor(statusColor),
            }}
          >
            {caseStatus}
          </span>
        </div>
      </section>

      <section className="panel-card overflow-hidden">
        <div className="grid gap-3 border-b border-[var(--line-soft)] p-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Patient Last Name</span>
            <input
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) => setLastName(event.target.value)}
              value={lastName}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Patient First Name</span>
            <input
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) => setFirstName(event.target.value)}
              value={firstName}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Attorney</span>
            <input
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              list="attorney-contacts"
              ref={attorneyInputRef}
              onBlur={handleAttorneyBlur}
              onChange={(event) => handleAttorneyChange(event.target.value)}
              value={attorney}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Attorney Phone</span>
            <input
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              readOnly
              placeholder="(000) 000-0000"
              value={attorneyPhone}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Patient DOB</span>
            <input
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              inputMode="numeric"
              maxLength={10}
              onChange={(event) => setPatientDob(formatUsDateInput(event.target.value))}
              placeholder="MM/DD/YYYY"
              value={patientDob}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Sex</span>
            <select
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) => setPatientSex(event.target.value as "Male" | "Female" | "Other" | "")}
              value={patientSex}
            >
              <option value="">—</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Status</span>
            <select
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) => setMaritalStatus(event.target.value as "Single" | "Married" | "Divorced" | "Widowed" | "Other" | "")}
              value={maritalStatus}
            >
              <option value="">—</option>
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Divorced">Divorced</option>
              <option value="Widowed">Widowed</option>
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Date Of Loss</span>
            <input
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              inputMode="numeric"
              maxLength={10}
              onChange={(event) => setDateOfLoss(formatUsDateInput(event.target.value))}
              placeholder="MM/DD/YYYY"
              value={dateOfLoss}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Initial Exam</span>
            <input
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              inputMode="numeric"
              maxLength={10}
              onChange={(event) => setInitialExam(formatUsDateInput(event.target.value))}
              placeholder="MM/DD/YYYY"
              value={initialExam}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Case #</span>
            <input
              className="rounded-xl border border-[var(--line-soft)] bg-[rgba(242,247,252,0.65)] px-3 py-2 font-semibold tracking-[0.08em] text-[var(--text-strong)]"
              placeholder="MMDDYYLASTFIRST"
              readOnly
              value={caseNumber}
            />
          </label>

          <label className="grid gap-1 md:col-span-1 xl:col-span-2">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Patient Phone</span>
            <input
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              inputMode="numeric"
              maxLength={12}
              onChange={(event) => setPatientPhone(formatUsPhoneInput(event.target.value))}
              value={patientPhone}
            />
          </label>

          <label className="grid gap-1 md:col-span-1 xl:col-span-2">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Patient Email</span>
            <input
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) => setPatientEmail(event.target.value)}
              value={patientEmail}
            />
          </label>

          <label className="grid gap-1 md:col-span-2 xl:col-span-4">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Patient Address</span>
            <input
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) => setPatientAddress(event.target.value)}
              placeholder="Street, City, State ZIP"
              value={patientAddress}
            />
          </label>
        </div>

        <div className="grid gap-3 border-b border-[var(--line-soft)] p-4 md:grid-cols-3">
          <label className="grid gap-1">
            <span className="text-sm font-semibold text-[var(--text-muted)]">{lienLabel}</span>
            <select
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) => setLienStatus(event.target.value)}
              value={resolvedLienStatus}
            >
              {lienSelectOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Prior Care</span>
            <input
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) => setPriorCare(event.target.value)}
              placeholder="Any prior treatment details"
              value={priorCare}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Status</span>
            <select
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) => setCaseStatus(event.target.value)}
              value={caseStatus}
            >
              {caseStatuses.map((statusConfigEntry) => (
                <option key={statusConfigEntry.name} value={statusConfigEntry.name}>
                  {statusConfigEntry.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid items-start gap-3 p-3 xl:grid-cols-3">
          <article className="rounded-2xl border border-[#bfd2e0] bg-gradient-to-b from-[#d8e7f2] to-[#cfe0ec] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            <button
              className="flex w-full items-center justify-between rounded-xl bg-[#6db5c8] px-3 py-2 text-2xl font-semibold tracking-[-0.01em] text-white"
              onClick={() => toggleImagingPanel("xray")}
              type="button"
            >
              <span>X-Ray</span>
              <span className="text-xl">{imagingPanelsOpen.xray ? "−" : "+"}</span>
            </button>

            {imagingPanelsOpen.xray && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Sent Date</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(event) =>
                      setXray((current) => ({ ...current, sentDate: formatUsDateInput(event.target.value) }))
                    }
                    placeholder="MM/DD/YYYY"
                    value={xray.sentDate}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Done Date</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(event) =>
                      setXray((current) => ({ ...current, doneDate: formatUsDateInput(event.target.value) }))
                    }
                    placeholder="MM/DD/YYYY"
                    value={xray.doneDate}
                  />
                </label>
                <label className="grid gap-1 sm:col-span-2">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Imaging Center</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    list="imaging-centers"
                    onChange={(event) => setXray((current) => ({ ...current, center: event.target.value }))}
                    placeholder="Select or type center"
                    value={xray.center}
                  />
                </label>
                <div className="grid gap-1 sm:col-span-2">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Regions</span>
                  <button
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 text-left"
                    onClick={(event) => {
                      setRegionModalAnchor(getPopupAnchorFromEvent(event));
                      setActiveRegionModal("xray");
                    }}
                    type="button"
                  >
                    Select / Update Regions
                  </button>
                  <div className="rounded-xl border border-[#b7ccdc] bg-white/90 p-1.5">
                    {xray.regions.length === 0 ? (
                      <p className="text-sm text-[var(--text-muted)]">No regions selected.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {xray.regions.map((region) => (
                          <span
                            key={`xray-region-${region}`}
                            className="inline-flex items-center gap-1 rounded-full border border-[#9ab8cc] bg-[#ecf4fa] px-2.5 py-1 text-sm font-semibold text-[#35566f]"
                          >
                            {formatRegionLabel(region, xray.lateralityByRegion)}
                            {xray.flexExtRegions.includes(region) && (
                              <span className="rounded-full bg-[#0d79bf] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-white">
                                Flex/Ext
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Report Received Date</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(event) =>
                      setXray((current) => ({
                        ...current,
                        reportReceivedDate: formatUsDateInput(event.target.value),
                      }))
                    }
                    placeholder="MM/DD/YYYY"
                    value={xray.reportReceivedDate}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Report Reviewed Date</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(event) =>
                      setXray((current) => ({
                        ...current,
                        reportReviewedDate: formatUsDateInput(event.target.value),
                      }))
                    }
                    placeholder="MM/DD/YYYY"
                    value={xray.reportReviewedDate}
                  />
                </label>
                <div className="flex gap-2 sm:col-span-2">
                  <button
                    className="w-full rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    onClick={() => saveImagingReferral("xray")}
                    type="button"
                  >
                    {editingXrayReferralId ? "Update X-Ray Sent" : "Add X-Ray Sent"}
                  </button>
                  {editingXrayReferralId && (
                    <button
                      className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 font-semibold"
                      onClick={() => cancelImagingReferralEdit("xray")}
                      type="button"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                <div className="grid gap-2 rounded-xl border border-[var(--line-soft)] bg-white p-2 sm:col-span-2">
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
                    <input
                      checked={xrayFollowUpOverride.patientRefused}
                      onChange={(event) => setPatientRefused(patient.id, "xray", event.target.checked)}
                      type="checkbox"
                    />
                    Patient Refused
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
                    <input
                      checked={xrayFollowUpOverride.completedPriorCare}
                      onChange={(event) => setCompletedPriorCare(patient.id, "xray", event.target.checked)}
                      type="checkbox"
                    />
                    Completed Prior Care
                  </label>
                </div>
              </div>
            )}

            {xrayMessage && (
              <p className={`${imagingPanelsOpen.xray ? "mt-2" : "mt-3"} text-xs font-semibold text-[var(--brand-primary)]`}>
                {xrayMessage}
              </p>
            )}
            <div
              className={`mt-2 space-y-2 overflow-auto rounded-xl border border-[var(--line-soft)] bg-white p-2 ${
                imagingPanelsOpen.xray ? "max-h-36 text-xs" : "max-h-56 text-sm"
              }`}
            >
              {xrayReferrals.length === 0 && <p className="text-[var(--text-muted)]">No X-Ray sent entries yet.</p>}
              {xrayReferrals.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-[var(--line-soft)] p-2">
                  <p className="font-semibold">
                    {entry.modalityLabel} Sent: {entry.sentDate}
                  </p>
                  <p>Center: {entry.center}</p>
                  <p>Regions: {formatImagingRegionsSummary(entry, "xray")}</p>
                  <p>Done: {entry.doneDate || "-"}</p>
                  <p>Report Received: {entry.reportReceivedDate || "-"}</p>
                  <p>Report Reviewed: {entry.reportReviewedDate || "-"}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 font-semibold"
                      onClick={() => generateImagingRequestPdf("xray", entry)}
                      type="button"
                    >
                      Generate PDF
                    </button>
                    <button
                      className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 font-semibold"
                      onClick={() => editImagingReferral("xray", entry.id)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 font-semibold"
                      onClick={() => removeImagingReferral("xray", entry.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-[#bfd2e0] bg-gradient-to-b from-[#d8e7f2] to-[#cfe0ec] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            <button
              className="flex w-full items-center justify-between rounded-xl bg-[#6db5c8] px-3 py-2 text-2xl font-semibold tracking-[-0.01em] text-white"
              onClick={() => toggleImagingPanel("mri")}
              type="button"
            >
              <span>{mri.isCt ? "MRI / CT" : "MRI"}</span>
              <span className="text-xl">{imagingPanelsOpen.mri ? "−" : "+"}</span>
            </button>

            {imagingPanelsOpen.mri && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="inline-flex items-center gap-2 rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 text-sm font-semibold sm:col-span-2">
                  <input
                    checked={Boolean(mri.isCt)}
                    onChange={(event) =>
                      setMri((current) => ({
                        ...current,
                        isCt: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  CT instead of MRI
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Sent Date</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(event) => setMri((current) => ({ ...current, sentDate: formatUsDateInput(event.target.value) }))}
                    placeholder="MM/DD/YYYY"
                    value={mri.sentDate}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Done Date</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(event) => setMri((current) => ({ ...current, doneDate: formatUsDateInput(event.target.value) }))}
                    placeholder="MM/DD/YYYY"
                    value={mri.doneDate}
                  />
                </label>
                <label className="grid gap-1 sm:col-span-2">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Imaging Center</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    list="imaging-centers"
                    onChange={(event) => setMri((current) => ({ ...current, center: event.target.value }))}
                    placeholder="Select or type center"
                    value={mri.center}
                  />
                </label>
                <div className="grid gap-1 sm:col-span-2">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Regions</span>
                  <button
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 text-left"
                    onClick={(event) => {
                      setRegionModalAnchor(getPopupAnchorFromEvent(event));
                      setActiveRegionModal("mri");
                    }}
                    type="button"
                  >
                    Select / Update Regions
                  </button>
                  <div className="rounded-xl border border-[#b7ccdc] bg-white/90 p-1.5">
                    {mri.regions.length === 0 ? (
                      <p className="text-sm text-[var(--text-muted)]">No regions selected.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {mri.regions.map((region) => (
                          <span
                            key={`mri-region-${region}`}
                            className="inline-flex items-center rounded-full border border-[#9ab8cc] bg-[#ecf4fa] px-2.5 py-1 text-sm font-semibold text-[#35566f]"
                          >
                            {formatRegionLabel(region, mri.lateralityByRegion)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Report Received Date</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(event) =>
                      setMri((current) => ({
                        ...current,
                        reportReceivedDate: formatUsDateInput(event.target.value),
                      }))
                    }
                    placeholder="MM/DD/YYYY"
                    value={mri.reportReceivedDate}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Report Reviewed Date</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(event) =>
                      setMri((current) => ({
                        ...current,
                        reportReviewedDate: formatUsDateInput(event.target.value),
                      }))
                    }
                    placeholder="MM/DD/YYYY"
                    value={mri.reportReviewedDate}
                  />
                </label>
                <div className="flex gap-2 sm:col-span-2">
                  <button
                    className="w-full rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    onClick={() => saveImagingReferral("mri")}
                    type="button"
                  >
                    {editingMriReferralId ? "Update MRI / CT Sent" : "Add MRI / CT Sent"}
                  </button>
                  {editingMriReferralId && (
                    <button
                      className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 font-semibold"
                      onClick={() => cancelImagingReferralEdit("mri")}
                      type="button"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                <div className="grid gap-2 rounded-xl border border-[var(--line-soft)] bg-white p-2 sm:col-span-2">
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
                    <input
                      checked={mriCtFollowUpOverride.patientRefused}
                      onChange={(event) => setPatientRefused(patient.id, "mriCt", event.target.checked)}
                      type="checkbox"
                    />
                    Patient Refused
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
                    <input
                      checked={mriCtFollowUpOverride.completedPriorCare}
                      onChange={(event) => setCompletedPriorCare(patient.id, "mriCt", event.target.checked)}
                      type="checkbox"
                    />
                    Completed Prior Care
                  </label>
                </div>
              </div>
            )}

            {mriMessage && (
              <p className={`${imagingPanelsOpen.mri ? "mt-2" : "mt-3"} text-xs font-semibold text-[var(--brand-primary)]`}>
                {mriMessage}
              </p>
            )}
            <div
              className={`mt-2 space-y-2 overflow-auto rounded-xl border border-[var(--line-soft)] bg-white p-2 ${
                imagingPanelsOpen.mri ? "max-h-36 text-xs" : "max-h-56 text-sm"
              }`}
            >
              {mriReferrals.length === 0 && <p className="text-[var(--text-muted)]">No MRI / CT sent entries yet.</p>}
              {mriReferrals.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-[var(--line-soft)] p-2">
                  <p className="font-semibold">
                    {entry.modalityLabel} Sent: {entry.sentDate}
                  </p>
                  <p>Center: {entry.center}</p>
                  <p>Regions: {formatImagingRegionsSummary(entry, "mri")}</p>
                  <p>Done: {entry.doneDate || "-"}</p>
                  <p>Report Received: {entry.reportReceivedDate || "-"}</p>
                  <p>Report Reviewed: {entry.reportReviewedDate || "-"}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 font-semibold"
                      onClick={() => generateImagingRequestPdf("mri", entry)}
                      type="button"
                    >
                      Generate PDF
                    </button>
                    <button
                      className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 font-semibold"
                      onClick={() => editImagingReferral("mri", entry.id)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 font-semibold"
                      onClick={() => removeImagingReferral("mri", entry.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-[#bfd2e0] bg-gradient-to-b from-[#d8e7f2] to-[#cfe0ec] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            <button
              className="flex w-full items-center justify-between rounded-xl bg-[#6db5c8] px-3 py-2 text-2xl font-semibold tracking-[-0.01em] text-white"
              onClick={() => toggleImagingPanel("specialist")}
              type="button"
            >
              <span>Specialist</span>
              <span className="text-xl">{imagingPanelsOpen.specialist ? "−" : "+"}</span>
            </button>

            {imagingPanelsOpen.specialist && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 sm:col-span-2">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Specialist</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    list="specialist-contacts"
                    onChange={(event) =>
                      setSpecialistDraft((current) => ({ ...current, specialist: event.target.value }))
                    }
                    placeholder="Select or type specialist"
                    value={specialistDraft.specialist}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Sent Date</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    onChange={(event) =>
                      setSpecialistDraft((current) => ({
                        ...current,
                        sentDate: formatUsDateInput(event.target.value),
                      }))
                    }
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="MM/DD/YYYY"
                    value={specialistDraft.sentDate}
                  />
                </label>
                <button
                  className="w-full self-end rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 font-semibold"
                  onClick={addSpecialist}
                  type="button"
                >
                  Add Specialist
                </button>
                <div className="grid gap-2 rounded-xl border border-[var(--line-soft)] bg-white p-2 sm:col-span-2">
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
                    <input
                      checked={specialistFollowUpOverride.patientRefused}
                      onChange={(event) => setPatientRefused(patient.id, "specialist", event.target.checked)}
                      type="checkbox"
                    />
                    Patient Refused
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
                    <input
                      checked={specialistFollowUpOverride.completedPriorCare}
                      onChange={(event) => setCompletedPriorCare(patient.id, "specialist", event.target.checked)}
                      type="checkbox"
                    />
                    Completed Prior Care
                  </label>
                </div>
              </div>
            )}

            {specialistMessage && (
              <p
                className={`${imagingPanelsOpen.specialist ? "mt-2" : "mt-3"} text-xs font-semibold text-[var(--brand-primary)]`}
              >
                {specialistMessage}
              </p>
            )}
            <div
              className={`mt-2 space-y-2 overflow-auto rounded-xl border border-[var(--line-soft)] bg-white p-2 ${
                imagingPanelsOpen.specialist ? "max-h-36 text-xs" : "max-h-56 text-sm"
              }`}
            >
              {specialistReferrals.length === 0 && (
                <p className="text-[var(--text-muted)]">No specialist referrals added yet.</p>
              )}
              {specialistReferrals.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-[var(--line-soft)] p-2">
                  <p className="font-semibold">{entry.specialist}</p>
                  <p>Sent: {entry.sentDate || "-"}</p>
                  <p>Scheduled: {entry.scheduledDate || "-"}</p>
                  <p>Report Received: {entry.reportReceivedDate ? "Yes" : "No"}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 font-semibold"
                      onClick={() => generateSpecialistReferralPdf(entry)}
                      type="button"
                    >
                      Generate PDF
                    </button>
                    <button
                      className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 font-semibold"
                      onClick={(event) => openSpecialistEditor(entry, event)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 font-semibold"
                      onClick={() => removeSpecialist(entry.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="panel-card p-4">
        <button
          className="flex w-full items-center justify-between rounded-xl bg-[#72bdcf] px-3 py-2 text-center text-lg font-semibold text-white"
          onClick={() => toggleSectionPanel("findings")}
          type="button"
        >
          <span>Findings / Recommendations</span>
          <span className="text-xl">{sectionPanelsOpen.findings ? "−" : "+"}</span>
        </button>
        {sectionPanelsOpen.findings && (
          <div className="mt-3 grid gap-3 xl:grid-cols-3">
            <article className="rounded-2xl border border-[#bfd2e0] bg-gradient-to-b from-[#d8e7f2] to-[#cfe0ec] p-3">
              <h3 className="text-base font-semibold text-[var(--text-strong)]">X-Ray Findings</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Insert field:{" "}
                <code className="rounded bg-white px-1 py-0.5 text-[11px] font-semibold text-[var(--text-strong)]">
                  {`{{XRAY_FINDINGS}}`}
                </code>
              </p>
              {xrayFindingRegionLabels.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {xrayFindingRegionLabels.map((regionLabel) => (
                    <button
                      key={`xray-finding-region-${regionLabel}`}
                      className="rounded-full border border-[var(--line-soft)] bg-white px-2 py-1 text-xs font-semibold"
                      onClick={() => appendFindingRegionLabel("xray", regionLabel)}
                      type="button"
                    >
                      + {regionLabel}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                className="mt-2 min-h-[150px] rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                onChange={(event) => setXrayFindings(event.target.value)}
                placeholder="Enter X-Ray findings (for example: Cervical: Loss of lordosis...)"
                value={xrayFindings}
              />
            </article>

            <article className="rounded-2xl border border-[#bfd2e0] bg-gradient-to-b from-[#d8e7f2] to-[#cfe0ec] p-3">
              <h3 className="text-base font-semibold text-[var(--text-strong)]">MRI / CT Findings</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Insert field:{" "}
                <code className="rounded bg-white px-1 py-0.5 text-[11px] font-semibold text-[var(--text-strong)]">
                  {`{{MRI_CT_FINDINGS}}`}
                </code>
              </p>
              {mriFindingRegionLabels.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {mriFindingRegionLabels.map((regionLabel) => (
                    <button
                      key={`mri-finding-region-${regionLabel}`}
                      className="rounded-full border border-[var(--line-soft)] bg-white px-2 py-1 text-xs font-semibold"
                      onClick={() => appendFindingRegionLabel("mriCt", regionLabel)}
                      type="button"
                    >
                      + {regionLabel}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                className="mt-2 min-h-[150px] rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                onChange={(event) => setMriCtFindings(event.target.value)}
                placeholder="Enter MRI/CT findings (for example: Lumbar: L4-L5 disc bulge...)"
                value={mriCtFindings}
              />
            </article>

            <article className="rounded-2xl border border-[#bfd2e0] bg-gradient-to-b from-[#d8e7f2] to-[#cfe0ec] p-3">
              <h3 className="text-base font-semibold text-[var(--text-strong)]">Specialist Recommendations</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Insert field:{" "}
                <code className="rounded bg-white px-1 py-0.5 text-[11px] font-semibold text-[var(--text-strong)]">
                  {`{{SPECIALIST_RECOMMENDATIONS}}`}
                </code>
              </p>
              <textarea
                className="mt-2 min-h-[150px] rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                onChange={(event) => setSpecialistRecommendations(event.target.value)}
                placeholder="Paste specialist recommendations here..."
                value={specialistRecommendations}
              />
            </article>
          </div>
        )}
      </section>

      <section className="panel-card p-4">
        <button
          className="flex w-full items-center justify-between rounded-xl bg-[#72bdcf] px-3 py-2 text-center text-lg font-semibold text-white"
          onClick={() => toggleSectionPanel("notes")}
          type="button"
        >
          <span>Notes</span>
          <span className="text-xl">{sectionPanelsOpen.notes ? "−" : "+"}</span>
        </button>
        {sectionPanelsOpen.notes && (
          <label className="mt-3 grid gap-1">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Case Notes</span>
            <textarea
              className="min-h-[140px] rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) => setPatientNotes(event.target.value)}
              placeholder="Enter any free-form case notes..."
              value={patientNotes}
            />
          </label>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="panel-card p-4">
          <button
            className="flex w-full items-center justify-between rounded-xl bg-[#72bdcf] px-3 py-2 text-center text-lg font-semibold text-white"
            onClick={() => toggleSectionPanel("reExam")}
            type="button"
          >
            <span>Re-Exam</span>
            <span className="text-xl">{sectionPanelsOpen.reExam ? "−" : "+"}</span>
          </button>
          {sectionPanelsOpen.reExam && (
            <>
              <div className="mt-3 flex gap-2">
                <input
                  className="w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(event) => setReExamDraft(formatUsDateInput(event.target.value))}
                  placeholder="MM/DD/YYYY"
                  value={reExamDraft}
                />
                <button
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
                  onClick={addReExam}
                  type="button"
                >
                  Add
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {reExams.map((date, index) => (
                  <span
                    key={`${date}-${index}`}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--line-soft)] bg-white px-3 py-1 text-sm"
                  >
                    <span>{date}</span>
                    <button
                      className="rounded-full border border-[var(--line-soft)] px-2 text-xs font-semibold"
                      onClick={() => removeReExam(index)}
                      type="button"
                    >
                      x
                    </button>
                  </span>
                ))}
                {reExams.length === 0 && <p className="text-sm text-[var(--text-muted)]">No re-exams added.</p>}
              </div>
            </>
          )}
        </article>

        <article className="panel-card p-4">
          <button
            className="flex w-full items-center justify-between rounded-xl bg-[#72bdcf] px-3 py-2 text-center text-lg font-semibold text-white"
            onClick={() => toggleSectionPanel("relatedCases")}
            type="button"
          >
            <span>Related Cases</span>
            <span className="text-xl">{sectionPanelsOpen.relatedCases ? "−" : "+"}</span>
          </button>
          {sectionPanelsOpen.relatedCases && (
            <>
              <div className="mt-3 flex gap-2">
                <div className="relative w-full">
                  <input
                    className="w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    onBlur={() => {
                      setTimeout(() => setShowRelatedCaseSuggestions(false), 120);
                    }}
                    onChange={(event) => {
                      setRelatedCaseDraft(event.target.value);
                      setSelectedRelatedPatientId(null);
                      setRelatedCaseMessage("");
                      setShowRelatedCaseSuggestions(true);
                    }}
                    onFocus={() => setShowRelatedCaseSuggestions(true)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addRelatedCase();
                      }
                    }}
                    placeholder="Search patient..."
                    value={relatedCaseDraft}
                  />
                  {showRelatedCaseSuggestions && (
                    <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-[var(--line-soft)] bg-white shadow-[0_10px_28px_rgba(20,35,52,0.12)]">
                      {relatedCaseSuggestions.map((entry) => (
                        <button
                          key={`related-suggestion-${entry.id}`}
                          className="block w-full border-b border-[var(--line-soft)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--bg-soft)]"
                          onClick={() => {
                            setSelectedRelatedPatientId(entry.id);
                            setRelatedCaseDraft(entry.fullName);
                            setShowRelatedCaseSuggestions(false);
                          }}
                          type="button"
                        >
                          <span className="font-semibold">{entry.fullName}</span>{" "}
                          <span className="text-[var(--text-muted)]">DOI {toUsDate(entry.dateOfLoss)}</span>
                        </button>
                      ))}
                      {relatedCaseSuggestions.length === 0 && (
                        <p className="px-3 py-2 text-sm text-[var(--text-muted)]">No matching patients.</p>
                      )}
                    </div>
                  )}
                </div>
                <button
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
                  onClick={addRelatedCase}
                  type="button"
                >
                  Add
                </button>
              </div>
              {relatedCaseMessage && (
                <p className="mt-2 text-xs font-semibold text-[#b43b34]">{relatedCaseMessage}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {relatedCases.map((entry) => (
                  <div
                    key={entry.patientId}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--line-soft)] bg-white px-3 py-1 text-sm"
                  >
                    <button
                      className="inline-flex items-center gap-2 rounded-full px-1 text-left hover:text-[var(--brand-primary)]"
                      onClick={(event) => openRelatedCaseNavigatePrompt(entry, event)}
                      type="button"
                    >
                      <span className="font-semibold">{entry.fullName}</span>
                      <span className="text-[var(--text-muted)]">DOI {toUsDate(entry.dateOfLoss)}</span>
                    </button>
                    <button
                      className="rounded-full border border-[var(--line-soft)] px-2 text-xs font-semibold"
                      onClick={() => removeRelatedCase(entry.patientId)}
                      type="button"
                    >
                      x
                    </button>
                  </div>
                ))}
                {relatedCases.length === 0 && <p className="text-sm text-[var(--text-muted)]">No related cases linked.</p>}
              </div>
            </>
          )}
        </article>

        <article className="panel-card p-4">
          <button
            className="flex w-full items-center justify-between rounded-xl bg-[#72bdcf] px-3 py-2 text-center text-lg font-semibold text-white"
            onClick={() => toggleSectionPanel("quickStats")}
            type="button"
          >
            <span>Quick Stats</span>
            <span className="text-xl">{sectionPanelsOpen.quickStats ? "−" : "+"}</span>
          </button>
          {sectionPanelsOpen.quickStats && (
            <>
              <p className="mt-2 text-xs text-[var(--text-muted)]">Configure visible items in Settings → Quick Stats.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {quickStatRows.map((row) => (
                  <div
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    key={`quick-stat-${row.key}`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      {row.label}
                    </p>
                    <p className="mt-1 text-xl font-semibold text-[var(--text-main)]">{row.value}</p>
                    {row.helper && <p className="text-xs text-[var(--text-muted)]">{row.helper}</p>}
                  </div>
                ))}
                {quickStatRows.length === 0 && (
                  <p className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 text-sm text-[var(--text-muted)]">
                    All quick stats are hidden. Enable them in Settings → Quick Stats.
                  </p>
                )}
              </div>
            </>
          )}
        </article>
      </section>

      <section className="panel-card p-4">
        <button
          className="flex w-full items-center justify-between rounded-xl bg-[#72bdcf] px-3 py-2 text-center text-lg font-semibold text-white"
          onClick={() => toggleSectionPanel("appointments")}
          type="button"
        >
          <span>Appointments / Encounters</span>
          <span className="text-xl">{sectionPanelsOpen.appointments ? "−" : "+"}</span>
        </button>
        {sectionPanelsOpen.appointments && (
          <>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              View all scheduled appointments for this patient and launch encounters quickly.
            </p>

            {encounterMessage && <p className="mt-2 text-sm font-semibold text-[var(--brand-primary)]">{encounterMessage}</p>}

            <div className="mt-3 grid gap-4 xl:grid-cols-[1.8fr_1fr]">
              <article className="rounded-xl border border-[var(--line-soft)] bg-white p-3">
                <h4 className="text-base font-semibold">Scheduled Appointments</h4>
                <div className="mt-2 overflow-x-auto rounded-xl border border-[var(--line-soft)]">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-[var(--bg-soft)] text-left">
                        <th className="px-2 py-2">Date</th>
                        <th className="px-2 py-2">Type</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2">Encounter</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appointmentRows.map((row) => {
                        const linkedEncounter = row.linkedEncounter;
                        const appointment = row.appointment;
                        return (
                          <tr key={row.rowId} className="border-t border-[var(--line-soft)]">
                            <td className="px-2 py-2 tabular-nums">{row.dateLabel}</td>
                            <td className="px-2 py-2">{row.typeLabel}</td>
                            <td className="px-2 py-2">{row.statusLabel}</td>
                            <td className="px-2 py-2">
                              {linkedEncounter ? (
                                <button
                                  className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 text-xs font-semibold"
                                  onClick={() => openEncounterEditor(linkedEncounter.id)}
                                  type="button"
                                >
                                  Open Encounter
                                </button>
                              ) : appointment ? (
                                <button
                                  className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 text-xs font-semibold"
                                  onClick={() => createEncounterFromAppointment(appointment)}
                                  type="button"
                                >
                                  + Encounter
                                </button>
                              ) : (
                                <span className="text-xs text-[var(--text-muted)]">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {appointmentRows.length === 0 && (
                        <tr>
                          <td className="px-2 py-3 text-[var(--text-muted)]" colSpan={4}>
                            No appointments scheduled for this patient yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="rounded-xl border border-[var(--line-soft)] bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-base font-semibold">Open Encounters</h4>
                  <Link
                    className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 text-xs font-semibold"
                    href={`/encounters?patientId=${patient.id}`}
                  >
                    Open Workspace
                  </Link>
                </div>
                <div className="mt-2 max-h-72 space-y-2 overflow-auto">
                  {openPatientEncounterRecords.map((encounter) => (
                    <div
                      key={`open-encounter-${encounter.id}`}
                      className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-2"
                    >
                      <p className="text-sm font-semibold">{encounter.encounterDate}</p>
                      <p className="text-xs text-[var(--text-muted)]">{encounter.appointmentType}</p>
                      <button
                        className="mt-2 rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 text-xs font-semibold"
                        onClick={() => openEncounterEditor(encounter.id)}
                        type="button"
                      >
                        Open
                      </button>
                    </div>
                  ))}
                  {openPatientEncounterRecords.length === 0 && (
                    <p className="text-sm text-[var(--text-muted)]">No open encounters for this patient.</p>
                  )}
                </div>
              </article>
            </div>
          </>
        )}
      </section>

      <section className="panel-card p-4">
        <button
          className="flex w-full items-center justify-between rounded-xl bg-[#72bdcf] px-3 py-2 text-center text-lg font-semibold text-white"
          onClick={() => toggleSectionPanel("diagnosis")}
          type="button"
        >
          <span>Diagnosis Codes</span>
          <span className="text-xl">{sectionPanelsOpen.diagnosis ? "−" : "+"}</span>
        </button>
        {sectionPanelsOpen.diagnosis && (
          <>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Add one code, add a preset bundle, or enter custom diagnosis codes for this patient file.
            </p>

            <div className="mt-3 grid gap-4 xl:grid-cols-3">
              <div className="space-y-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3">
                <p className="text-sm font-semibold">Add Diagnosis Macro</p>
                <select
                  className="w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  onChange={(event) => setDiagnosisMacroIdDraft(event.target.value)}
                  value={diagnosisMacroIdDraft}
                >
                  <option value="">Select diagnosis code</option>
                  {activeDiagnosisMacros.map((entry) => (
                    <option key={`dx-macro-${entry.id}`} value={entry.id}>
                      {entry.code} - {entry.description}
                    </option>
                  ))}
                </select>
                <button
                  className="w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 font-semibold"
                  onClick={addDiagnosisFromMacro}
                  type="button"
                >
                  Add Diagnosis Code
                </button>
              </div>

              <div className="space-y-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3">
                <p className="text-sm font-semibold">Add Diagnosis Bundle</p>
                <select
                  className="w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  onChange={(event) => setDiagnosisBundleIdDraft(event.target.value)}
                  value={diagnosisBundleIdDraft}
                >
                  <option value="">Select bundle</option>
                  {activeDiagnosisBundles.map((entry) => (
                    <option key={`dx-bundle-${entry.id}`} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
                <button
                  className="w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 font-semibold"
                  onClick={addDiagnosisBundle}
                  type="button"
                >
                  Add Bundle
                </button>
              </div>

              <div className="space-y-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3">
                <p className="text-sm font-semibold">Add Custom Diagnosis</p>
                <input
                  className="w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  onChange={(event) => setCustomDiagnosisCodeDraft(event.target.value)}
                  placeholder="ICD-10 Code"
                  value={customDiagnosisCodeDraft}
                />
                <input
                  className="w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  onChange={(event) => setCustomDiagnosisDescriptionDraft(event.target.value)}
                  placeholder="Description"
                  value={customDiagnosisDescriptionDraft}
                />
                <button
                  className="w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 font-semibold"
                  onClick={addCustomDiagnosis}
                  type="button"
                >
                  Add Custom Code
                </button>
              </div>
            </div>

            {diagnosisMessage && <p className="mt-3 text-sm font-semibold text-[var(--brand-primary)]">{diagnosisMessage}</p>}

            <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--line-soft)] bg-white">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[var(--bg-soft)] text-left">
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {patientDiagnoses.map((entry) => (
                    <tr key={entry.id} className="border-t border-[var(--line-soft)]">
                      <td className="px-3 py-2 font-semibold">{entry.code}</td>
                      <td className="px-3 py-2">{entry.description}</td>
                      <td className="px-3 py-2 text-[var(--text-muted)]">{entry.source}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 text-xs font-semibold"
                          onClick={() => removeDiagnosis(entry.id)}
                          type="button"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                  {patientDiagnoses.length === 0 && (
                    <tr>
                      <td className="px-3 py-3 text-[var(--text-muted)]" colSpan={4}>
                        No diagnosis codes on this patient file yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="panel-card p-4">
        <button
          className="flex w-full items-center justify-between rounded-xl bg-[#72bdcf] px-3 py-2 text-center text-lg font-semibold text-white"
          onClick={() => toggleSectionPanel("letters")}
          type="button"
        >
          <span>Letters</span>
          <span className="text-xl">{sectionPanelsOpen.letters ? "−" : "+"}</span>
        </button>
        {sectionPanelsOpen.letters && (
          <>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Generate school notes, work notes, gym notes, and other custom letters from saved templates.
            </p>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
              <label className="grid gap-1">
                <span className="text-sm font-semibold text-[var(--text-muted)]">Letter Template</span>
                <select
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  onChange={(event) => {
                    setLetterTemplateIdDraft(event.target.value);
                    setLetterMessage("");
                  }}
                  value={selectedLetterTemplate?.id ?? ""}
                >
                  {availableLetterTemplates.length === 0 ? (
                    <option value="">No letter templates available</option>
                  ) : (
                    availableLetterTemplates.map((template) => (
                      <option key={`patient-letter-template-${template.id}`} value={template.id}>
                        {template.name}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <button
                className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
                onClick={generateLetterPdf}
                type="button"
              >
                Generate PDF
              </button>

              <button
                className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
                onClick={() => openTemplateSettings("generalLetter")}
                type="button"
              >
                Manage Templates
              </button>
            </div>

            {letterMessage && (
              <p className="mt-2 text-sm font-semibold text-[var(--brand-primary)]">{letterMessage}</p>
            )}
          </>
        )}
      </section>

      <section className="panel-card p-4">
        <button
          className="flex w-full items-center justify-between rounded-xl bg-[#72bdcf] px-3 py-2 text-center text-lg font-semibold text-white"
          onClick={() => toggleSectionPanel("narrative")}
          type="button"
        >
          <span>Full Narrative Report</span>
          <span className="text-xl">{sectionPanelsOpen.narrative ? "−" : "+"}</span>
        </button>
        {sectionPanelsOpen.narrative && (
          <>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Build a long-form narrative from patient demographics, encounters, diagnoses, imaging, specialist referrals, and custom prompt inputs.
            </p>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
              <label className="grid gap-1">
                <span className="text-sm font-semibold text-[var(--text-muted)]">Narrative Template</span>
                <select
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  onChange={(event) => {
                    setNarrativeTemplateIdDraft(event.target.value);
                    setNarrativeMessage("");
                  }}
                  value={selectedNarrativeTemplate?.id ?? ""}
                >
                  {availableNarrativeTemplates.length === 0 ? (
                    <option value="">No narrative templates available</option>
                  ) : (
                    availableNarrativeTemplates.map((template) => (
                      <option key={`patient-narrative-template-${template.id}`} value={template.id}>
                        {template.name}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <button
                className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
                onClick={startNarrativeGeneration}
                type="button"
              >
                Generate Narrative
              </button>

              <button
                className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
                onClick={openReportTemplateSettings}
                type="button"
              >
                Manage Report Templates
              </button>
            </div>

            {narrativeMessage && (
              <p className="mt-2 text-sm font-semibold text-[var(--brand-primary)]">{narrativeMessage}</p>
            )}
          </>
        )}
      </section>

      <section className="panel-card p-4">
        <button
          className="flex w-full items-center justify-between rounded-2xl bg-[#6db5c8] px-3 py-2 text-center text-3xl font-semibold tracking-[-0.01em] text-white"
          onClick={() => toggleSectionPanel("additionalDetails")}
          type="button"
        >
          <span>Additional Details</span>
          <span className="text-xl">{sectionPanelsOpen.additionalDetails ? "−" : "+"}</span>
        </button>
        {sectionPanelsOpen.additionalDetails && (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="grid gap-1">
                <span className="text-sm font-semibold text-[var(--text-muted)]">Discharge</span>
                <input
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(event) => setDischargeDate(formatUsDateInput(event.target.value))}
                  placeholder="MM/DD/YYYY"
                  value={dischargeDate}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-semibold text-[var(--text-muted)]">R&B Sent</span>
                <input
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(event) => setRbSentDate(formatUsDateInput(event.target.value))}
                  placeholder="MM/DD/YYYY"
                  value={rbSentDate}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-semibold text-[var(--text-muted)]">$ Billed</span>
                <input
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  onChange={(event) => setBilledAmount(event.target.value)}
                  placeholder="0.00"
                  type="number"
                  value={billedAmount}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-semibold text-[var(--text-muted)]">Paid Date</span>
                <input
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(event) => setPaidDate(formatUsDateInput(event.target.value))}
                  placeholder="MM/DD/YYYY"
                  value={paidDate}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-semibold text-[var(--text-muted)]">$ Paid Amount</span>
                <input
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  onChange={(event) => setPaidAmount(event.target.value)}
                  placeholder="0.00"
                  type="number"
                  value={paidAmount}
                />
              </label>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.8fr_1fr]">
              <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] px-4 py-3">
                <dl className="space-y-2 text-sm sm:text-base">
                  <div className="grid grid-cols-[minmax(0,220px)_minmax(0,1fr)] items-baseline gap-x-4">
                    <dt className="font-medium text-[var(--text-muted)]">Initial To Discharge:</dt>
                    <dd className="font-medium tabular-nums text-[var(--text-main)]">{initialToDischarge}</dd>
                  </div>
                  <div className="grid grid-cols-[minmax(0,220px)_minmax(0,1fr)] items-baseline gap-x-4">
                    <dt className="font-medium text-[var(--text-muted)]">Discharge To R&amp;B:</dt>
                    <dd className="font-medium tabular-nums text-[var(--text-main)]">{dischargeToRb}</dd>
                  </div>
                  <div className="grid grid-cols-[minmax(0,220px)_minmax(0,1fr)] items-baseline gap-x-4">
                    <dt className="font-medium text-[var(--text-muted)]">R&amp;B To Paid:</dt>
                    <dd className="font-medium tabular-nums text-[var(--text-main)]">{rbToPaid}</dd>
                  </div>
                  <div className="grid grid-cols-[minmax(0,220px)_minmax(0,1fr)] items-baseline gap-x-4">
                    <dt className="font-medium text-[var(--text-muted)]">Percentage Paid:</dt>
                    <dd className="font-medium tabular-nums text-[var(--text-main)]">
                      {formatPercentage(percentagePaid)}
                    </dd>
                  </div>
                  <div className="grid grid-cols-[minmax(0,220px)_minmax(0,1fr)] items-baseline gap-x-4">
                    <dt className="font-medium text-[var(--text-muted)]">Adjustments:</dt>
                    <dd className="font-medium tabular-nums text-[var(--text-main)]">
                      {formatUsdCurrency(closeoutAdjustmentTotal)}
                    </dd>
                  </div>
                  <div className="grid grid-cols-[minmax(0,220px)_minmax(0,1fr)] items-baseline gap-x-4">
                    <dt className="font-medium text-[var(--text-muted)]">Balance Due:</dt>
                    <dd className="font-medium tabular-nums text-[var(--text-main)]">
                      {balanceDue === null ? "-" : formatUsdCurrency(balanceDue)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Close-out adjustments are managed in the Billing tab and included in balance due.
                </p>
              </div>

              <label className="grid gap-1">
                <span className="text-xl font-semibold">Review?</span>
                <select
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 text-lg font-semibold"
                  onChange={(event) => setReviewStatus(event.target.value)}
                  value={reviewStatus}
                >
                  {reviewOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

          </>
        )}
      </section>

      <div className="panel-card flex flex-wrap items-center justify-between gap-2 p-4">
        {saveMessage && <p className="text-sm font-semibold text-[var(--brand-primary)]">{saveMessage}</p>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            className="rounded-xl border border-[var(--line-soft)] bg-white px-6 py-2 font-semibold"
            onClick={savePatientFile}
            type="button"
          >
            Save
          </button>
          <button
            className="rounded-xl bg-[#de3a31] px-6 py-2 font-semibold text-white"
            onClick={saveAndClosePatientFile}
            type="button"
          >
            Save &amp; Close
          </button>
        </div>
      </div>

      {showNarrativePromptModal && narrativePromptTemplate && (
        <div className="fixed inset-0 z-50 bg-black/45 p-4">
          <div className="relative h-full w-full">
            <div className="panel-card mx-auto max-h-[84vh] w-full max-w-3xl overflow-auto p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xl font-semibold">Narrative Inputs</h3>
                  <p className="text-sm text-[var(--text-muted)]">{narrativePromptTemplate.name}</p>
                </div>
                <button
                  className="rounded-lg border border-[var(--line-soft)] px-3 py-1 text-sm"
                  onClick={closeNarrativePromptModal}
                  type="button"
                >
                  Close
                </button>
              </div>

              <div className="space-y-3">
                {narrativePromptTemplate.prompts.map((prompt) => {
                  const selectedValue = narrativePromptValues[prompt.token] ?? "";
                  const hasOptions = prompt.options.length > 0;
                  return (
                    <article
                      className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3"
                      key={prompt.id}
                    >
                      <p className="text-sm font-semibold">
                        {prompt.label}
                        {prompt.required ? " *" : ""}
                      </p>

                      {hasOptions ? (
                        <div className="mt-2 space-y-2">
                          {prompt.options.map((option) => {
                            const checked = selectedValue === option;
                            return (
                              <button
                                className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold ${
                                  checked
                                    ? "border-[var(--brand-primary)] bg-[rgba(13,121,191,0.12)] text-[var(--brand-primary)]"
                                    : "border-[var(--line-soft)] bg-white text-[var(--text-main)]"
                                }`}
                                key={`${prompt.id}-${option}`}
                                onClick={() =>
                                  setNarrativePromptValues((current) => ({
                                    ...current,
                                    [prompt.token]: option,
                                  }))
                                }
                                type="button"
                              >
                                {option}
                              </button>
                            );
                          })}
                          <input
                            className="w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                            onChange={(event) =>
                              setNarrativePromptValues((current) => ({
                                ...current,
                                [prompt.token]: event.target.value,
                              }))
                            }
                            placeholder="Or type custom value"
                            value={selectedValue}
                          />
                        </div>
                      ) : (
                        <input
                          className="mt-2 w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                          onChange={(event) =>
                            setNarrativePromptValues((current) => ({
                              ...current,
                              [prompt.token]: event.target.value,
                            }))
                          }
                          placeholder="Enter value"
                          value={selectedValue}
                        />
                      )}
                    </article>
                  );
                })}
              </div>

              {narrativePromptError && (
                <p className="mt-3 text-sm font-semibold text-[#b43b34]">{narrativePromptError}</p>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
                  onClick={closeNarrativePromptModal}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 font-semibold text-white"
                  onClick={continueNarrativeGeneration}
                  type="button"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNarrativePreviewModal && narrativePreview && (
        <div className="fixed inset-0 z-50 bg-black/45 p-4">
          <div className="relative h-full w-full">
            <div className="panel-card mx-auto max-h-[90vh] w-full max-w-6xl overflow-auto p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xl font-semibold">Narrative Preview</h3>
                  <p className="text-sm text-[var(--text-muted)]">{narrativePreview.title}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
                    onClick={printNarrativePreview}
                    type="button"
                  >
                    Print / Save PDF
                  </button>
                  <button
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
                    onClick={closeNarrativePreviewModal}
                    type="button"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <article className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3">
                  <label className="grid gap-1">
                    <span className="text-sm font-semibold text-[var(--text-muted)]">Header (optional)</span>
                    <textarea
                      className="min-h-[120px] rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 font-mono text-sm leading-6"
                      onChange={(event) =>
                        setNarrativePreview((current) =>
                          current ? { ...current, headerHtml: event.target.value } : current,
                        )
                      }
                      value={narrativePreview.headerHtml}
                    />
                  </label>
                  <label className="mt-3 grid gap-1">
                    <span className="text-sm font-semibold text-[var(--text-muted)]">Body</span>
                    <textarea
                      className="min-h-[420px] rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 font-mono text-sm leading-6"
                      onChange={(event) =>
                        setNarrativePreview((current) =>
                          current ? { ...current, bodyHtml: event.target.value } : current,
                        )
                      }
                      value={narrativePreview.bodyHtml}
                    />
                  </label>
                </article>

                <article className="rounded-xl border border-[var(--line-soft)] bg-white p-4">
                  <p className="mb-2 text-sm font-semibold text-[var(--text-muted)]">Live Render</p>
                  <div
                    className="space-y-4 whitespace-pre-wrap break-words"
                    style={{ fontFamily: narrativePreview.fontFamily }}
                  >
                    {narrativePreview.headerHtml.trim() && (
                      <div dangerouslySetInnerHTML={{ __html: narrativePreview.headerHtml }} />
                    )}
                    <div dangerouslySetInnerHTML={{ __html: narrativePreview.bodyHtml }} />
                  </div>
                </article>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeRegionModal && (
        <div className="fixed inset-0 z-40 bg-black/40 p-4">
          <div className="relative h-full w-full">
            <div
              className="panel-card overflow-auto p-4"
              style={getAnchoredModalStyle(regionModalAnchor, 960, 80)}
            >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xl font-semibold">
                {activeRegionModal === "xray" ? "X-Ray Regions" : `${mriStudyLabel} Regions`}
              </h3>
              <button
                className="rounded-lg border border-[var(--line-soft)] px-3 py-1 text-sm"
                onClick={() => {
                  setActiveRegionModal(null);
                  setRegionModalAnchor(null);
                }}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {availableImagingRegions.map((regionEntry) => {
                const region = regionEntry.label;
                const checked = activeImaging.regions.includes(region);
                const flexExt = activeImaging.flexExtRegions.includes(region);
                const laterality = activeImaging.lateralityByRegion[region];
                const supportsLaterality = supportsRegionLaterality(region);
                return (
                  <div
                    key={`${activeRegionModal}-${region}`}
                    className="rounded-xl border border-[var(--line-soft)] bg-white p-2"
                  >
                    <button
                      aria-pressed={checked}
                      className={`flex min-h-12 w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm font-semibold transition ${
                        checked
                          ? "border-[var(--brand-primary)] bg-[rgba(13,121,191,0.12)] text-[var(--brand-primary)]"
                          : "border-[var(--line-soft)] bg-white text-[var(--text-main)] hover:border-[var(--brand-primary)]"
                      }`}
                      onClick={() => {
                        setActiveImaging((current) => {
                          const alreadySelected = current.regions.includes(region);
                          const nextChecked = !alreadySelected;
                          const regions = nextChecked
                            ? [...current.regions, region]
                            : current.regions.filter((entry) => entry !== region);
                          const flexExtRegions = nextChecked
                            ? current.flexExtRegions
                            : current.flexExtRegions.filter((entry) => entry !== region);
                          const lateralityByRegion = { ...current.lateralityByRegion };
                          if (nextChecked && supportsRegionLaterality(region) && !lateralityByRegion[region]) {
                            lateralityByRegion[region] = "BL";
                          }
                          if (!nextChecked) {
                            delete lateralityByRegion[region];
                          }
                          return {
                            ...current,
                            regions,
                            lateralityByRegion,
                            flexExtRegions,
                          };
                        });
                      }}
                      type="button"
                    >
                      <span>{region}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] ${
                          checked
                            ? "bg-[var(--brand-primary)] text-white"
                            : "bg-[var(--bg-soft)] text-[var(--text-muted)]"
                        }`}
                      >
                        {checked ? "Selected" : "Tap"}
                      </span>
                    </button>

                    {activeRegionModal === "xray" && supportsXrayFlexExt(region) && (
                      <button
                        aria-pressed={flexExt}
                        className={`mt-2 flex min-h-11 w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                          !checked
                            ? "cursor-not-allowed border-[var(--line-soft)] bg-[var(--bg-soft)] text-[var(--text-muted)] opacity-70"
                            : flexExt
                              ? "border-[var(--brand-primary)] bg-[rgba(13,121,191,0.12)] text-[var(--brand-primary)]"
                              : "border-[var(--line-soft)] bg-white text-[var(--text-main)] hover:border-[var(--brand-primary)]"
                        }`}
                        disabled={!checked}
                        onClick={() => {
                          setActiveImaging((current) => {
                            if (!current.regions.includes(region)) {
                              return current;
                            }
                            const hasFlexExt = current.flexExtRegions.includes(region);
                            return {
                              ...current,
                              flexExtRegions: hasFlexExt
                                ? current.flexExtRegions.filter((entry) => entry !== region)
                                : [...current.flexExtRegions, region],
                            };
                          });
                        }}
                        type="button"
                      >
                        <span>Flex/Ext</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] ${
                            checked && flexExt
                              ? "bg-[var(--brand-primary)] text-white"
                              : "bg-[var(--bg-soft)] text-[var(--text-muted)]"
                          }`}
                        >
                          {flexExt ? "On" : "Off"}
                        </span>
                      </button>
                    )}

                    {checked && supportsLaterality && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-soft)] p-1">
                        {lateralityOptions.map((option) => (
                          <button
                            key={`${region}-lat-${option}`}
                            className={`rounded-md px-2 py-1 text-xs font-semibold ${
                              laterality === option
                                ? "bg-[var(--brand-primary)] text-white"
                                : "bg-white text-[var(--text-main)]"
                            }`}
                            onClick={() =>
                              setActiveImaging((current) => {
                                if (!current.regions.includes(region)) {
                                  return current;
                                }
                                return {
                                  ...current,
                                  lateralityByRegion: {
                                    ...current.lateralityByRegion,
                                    [region]: option,
                                  },
                                };
                              })
                            }
                            type="button"
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        </div>
      )}

      {showQuickTaskModal && (
        <div className="fixed inset-0 z-50 bg-black/45 p-4">
          <div className="relative h-full w-full">
            <div className="panel-card p-4" style={getAnchoredModalStyle(quickTaskAnchor, 680, 60)}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-xl font-semibold">Quick Add Task</h3>
                <button
                  className="rounded-lg border border-[var(--line-soft)] px-3 py-1 text-sm"
                  onClick={closeQuickTaskModal}
                  type="button"
                >
                  Close
                </button>
              </div>

              <p className="mb-3 text-sm text-[var(--text-muted)]">
                Add a task while working in this patient file. It will appear in <span className="font-semibold">My Tasks</span>.
              </p>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 md:col-span-2">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Task</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    onChange={(event) => setQuickTaskTitle(event.target.value)}
                    placeholder="Task title"
                    value={quickTaskTitle}
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Priority</span>
                  <select
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    onChange={(event) => setQuickTaskPriority(event.target.value as TaskPriority)}
                    value={quickTaskPriority}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Due Date (optional)</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(event) => setQuickTaskDueDate(formatUsDateInput(event.target.value))}
                    placeholder="MM/DD/YYYY"
                    value={quickTaskDueDate}
                  />
                </label>
              </div>

              {quickTaskModalMessage && (
                <p className="mt-3 text-sm font-semibold text-[#b43b34]">{quickTaskModalMessage}</p>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
                  onClick={closeQuickTaskModal}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 font-semibold text-white"
                  onClick={saveQuickTask}
                  type="button"
                >
                  Add Task
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddAttorneyPrompt && (
        <div className="fixed inset-0 z-50 bg-black/45 p-4">
          <div className="relative h-full w-full">
            <div className="panel-card p-4" style={getAnchoredModalStyle(attorneyPromptAnchor, 560, 50)}>
            <h3 className="text-xl font-semibold">Add New Attorney?</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {attorney.trim()} is not in Contacts. Do you want to add this attorney now?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
                onClick={dismissAttorneyPrompt}
                type="button"
              >
                No
              </button>
              <button
                className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 font-semibold text-white"
                onClick={(event) => openAttorneyForm(event)}
                type="button"
              >
                Yes
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {showAddAttorneyForm && (
        <div className="fixed inset-0 z-50 bg-black/45 p-4">
          <div className="relative h-full w-full">
            <div className="panel-card overflow-auto p-4" style={getAnchoredModalStyle(attorneyFormAnchor, 960, 85)}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-xl font-semibold">Add New Attorney</h3>
              <button
                className="rounded-lg border border-[var(--line-soft)] px-3 py-1 text-sm"
                onClick={() => {
                  setShowAddAttorneyForm(false);
                  setAttorneyModalError("");
                  setAttorneyFormAnchor(null);
                }}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm font-semibold text-[var(--text-muted)]">Attorney Name</span>
                <input
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  onChange={(event) =>
                    setNewAttorneyDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  value={newAttorneyDraft.name}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-semibold text-[var(--text-muted)]">Phone Number</span>
                <input
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  inputMode="numeric"
                  maxLength={12}
                  onChange={(event) =>
                    setNewAttorneyDraft((current) => ({
                      ...current,
                      phone: formatUsPhoneInput(event.target.value),
                    }))
                  }
                  value={newAttorneyDraft.phone}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-semibold text-[var(--text-muted)]">Fax Number</span>
                <input
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  inputMode="numeric"
                  maxLength={12}
                  onChange={(event) =>
                    setNewAttorneyDraft((current) => ({
                      ...current,
                      fax: formatUsPhoneInput(event.target.value),
                    }))
                  }
                  value={newAttorneyDraft.fax}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-semibold text-[var(--text-muted)]">Email Address</span>
                <input
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  onChange={(event) =>
                    setNewAttorneyDraft((current) => ({ ...current, email: event.target.value }))
                  }
                  value={newAttorneyDraft.email}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-semibold text-[var(--text-muted)]">Address</span>
                <input
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  onChange={(event) =>
                    setNewAttorneyDraft((current) => ({ ...current, address: event.target.value }))
                  }
                  value={newAttorneyDraft.address}
                />
              </label>
            </div>

            {attorneyModalError && (
              <p className="mt-3 text-sm font-semibold text-[#b43b34]">{attorneyModalError}</p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
                onClick={() => {
                  setShowAddAttorneyForm(false);
                  setAttorneyModalError("");
                  setAttorneyFormAnchor(null);
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 font-semibold text-white"
                onClick={saveAttorneyContact}
                type="button"
              >
                Save Attorney
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {editingSpecialist && (
        <div className="fixed inset-0 z-50 bg-black/45 p-4">
          <div className="relative h-full w-full">
            <div className="panel-card p-4" style={getAnchoredModalStyle(specialistEditorAnchor, 760, 75)}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xl font-semibold">Edit Specialist Referral</h3>
              <button
                className="rounded-lg border border-[var(--line-soft)] px-3 py-1 text-sm"
                onClick={() => {
                  setEditingSpecialist(null);
                  setSpecialistEditorAnchor(null);
                }}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              <label className="grid gap-1">
                <span className="text-sm font-semibold text-[var(--text-muted)]">Specialist</span>
                <input
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  list="specialist-contacts"
                  onChange={(event) =>
                    setEditingSpecialist((current) =>
                      current ? { ...current, specialist: event.target.value } : current,
                    )
                  }
                  value={editingSpecialist.specialist}
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Sent Date</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(event) =>
                      setEditingSpecialist((current) =>
                        current
                          ? { ...current, sentDate: formatUsDateInput(event.target.value) }
                          : current,
                      )
                    }
                    placeholder="MM/DD/YYYY"
                    value={editingSpecialist.sentDate}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Scheduled Date</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(event) =>
                      setEditingSpecialist((current) =>
                        current
                          ? { ...current, scheduledDate: formatUsDateInput(event.target.value) }
                          : current,
                      )
                    }
                    placeholder="MM/DD/YYYY"
                    value={editingSpecialist.scheduledDate}
                  />
                </label>
              </div>

              <div className="space-y-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3">
                <label className="inline-flex items-center gap-2 text-sm font-semibold">
                  <input
                    checked={Boolean(editingSpecialist.reportReceivedDate)}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setEditingSpecialist((current) => {
                        if (!current) {
                          return current;
                        }
                        if (!checked) {
                          return {
                            ...current,
                            reportReceivedDate: "",
                          };
                        }
                        return {
                          ...current,
                          reportReceivedDate: current.reportReceivedDate || getTodayUsDate(),
                        };
                      });
                    }}
                    type="checkbox"
                  />
                  Report Received
                </label>

                <input
                  className="w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  disabled={!editingSpecialist.reportReceivedDate}
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(event) =>
                    setEditingSpecialist((current) =>
                      current
                        ? { ...current, reportReceivedDate: formatUsDateInput(event.target.value) }
                        : current,
                    )
                  }
                  placeholder="Report Received Date (MM/DD/YYYY)"
                  value={editingSpecialist.reportReceivedDate}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
                onClick={() => {
                  setEditingSpecialist(null);
                  setSpecialistEditorAnchor(null);
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 font-semibold text-white"
                onClick={saveSpecialistEditor}
                type="button"
              >
                Save Specialist
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {relatedCaseNavigateTarget && (
        <div className="fixed inset-0 z-50 bg-black/45 p-4">
          <div className="relative h-full w-full">
            <div className="panel-card p-4" style={getAnchoredModalStyle(relatedCaseNavigateAnchor, 560, 50)}>
              <h3 className="text-xl font-semibold">Navigate to patient file?</h3>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Open <span className="font-semibold text-[var(--text-main)]">{relatedCaseNavigateTarget.fullName}</span> now?
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
                  onClick={closeRelatedCaseNavigatePrompt}
                  type="button"
                >
                  No
                </button>
                <button
                  className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 font-semibold text-white"
                  onClick={confirmRelatedCaseNavigation}
                  type="button"
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <datalist id="imaging-centers">
        {imagingCenters.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id="attorney-contacts">
        {attorneyContacts.map((contact) => (
          <option key={contact.id} value={contact.name} />
        ))}
      </datalist>
      <datalist id="specialist-contacts">
        {specialistContacts.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  );
}
