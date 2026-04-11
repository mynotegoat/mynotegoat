import { renderDocumentTemplate } from "@/lib/document-templates";
import { encounterSections, type EncounterChargeEntry, type EncounterNoteRecord, type EncounterSection } from "@/lib/encounter-notes";

type NarrativeOfficeContext = {
  officeName: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  doctorName: string;
};

type NarrativePatientContext = {
  firstName: string;
  lastName: string;
  fullName: string;
  dob: string;
  dateOfLoss: string;
  initialExam: string;
  phone: string;
  email: string;
  caseNumber: string;
  attorney: string;
  attorneyPhone: string;
  attorneyFax: string;
  attorneyEmail: string;
  attorneyAddress: string;
  caseStatus: string;
  lienStatus: string;
  priorCare: string;
  patientNotes: string;
  xrayFindings: string;
  mriCtFindings: string;
  specialistRecommendations: string;
  mrMrsMsLastName: string;
  heShe: string;
  hisHer: string;
};

type NarrativeAdditionalContext = {
  dischargeDate: string;
  rbSentDate: string;
  paidDate: string;
  billedAmount: string;
  paidAmount: string;
  reviewStatus: string;
};

type NarrativeDiagnosisEntry = {
  code: string;
  description: string;
};

type NarrativeImagingEntry = {
  modalityLabel: string;
  sentDate: string;
  center: string;
  regions: string[];
  lateralityByRegion?: Record<string, string>;
  flexExtRegions?: string[];
  scheduledDate?: string;
  doneDate: string;
  reportReceivedDate: string;
  reportReviewedDate: string;
  findings?: string;
};

type NarrativeSpecialistEntry = {
  specialist: string;
  sentDate: string;
  scheduledDate: string;
  completedDate?: string;
  reportReceivedDate: string;
  reportReviewedDate?: string;
  recommendations?: string;
};

export interface NarrativeReportBuildInput {
  office: NarrativeOfficeContext;
  patient: NarrativePatientContext;
  additional: NarrativeAdditionalContext;
  encounters: EncounterNoteRecord[];
  diagnoses: NarrativeDiagnosisEntry[];
  xrayReferrals: NarrativeImagingEntry[];
  mriReferrals: NarrativeImagingEntry[];
  specialistReferrals: NarrativeSpecialistEntry[];
  promptValues?: Record<string, string>;
}

function parseUsDate(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return null;
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!month || !day || !year) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCFullYear() !== year
  ) {
    return null;
  }
  return date;
}

function toSortStamp(dateText: string) {
  const parsed = parseUsDate(dateText);
  if (!parsed) {
    return 0;
  }
  return parsed.getTime();
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function toTwoDigit(value: number) {
  return `${value}`.padStart(2, "0");
}

function getTodayUsDate() {
  const now = new Date();
  return `${toTwoDigit(now.getMonth() + 1)}/${toTwoDigit(now.getDate())}/${now.getFullYear()}`;
}

function formatSoapRollup(encounters: EncounterNoteRecord[], section: EncounterSection) {
  const rows = encounters
    .map((entry) => ({
      date: entry.encounterDate,
      appointmentType: entry.appointmentType,
      value: entry.soap[section].trim(),
    }))
    .filter((entry) => entry.value);

  if (!rows.length) {
    return "-";
  }

  return rows
    .map((entry) => `${toUsDate(entry.date)} (${entry.appointmentType})\n${entry.value}`)
    .join("\n\n");
}

function formatMacroRollup(encounters: EncounterNoteRecord[], section: EncounterSection) {
  const rows = encounters.flatMap((entry) =>
    entry.macroRuns
      .filter((run) => run.section === section)
      .map((run) => ({
        date: entry.encounterDate,
        macroName: run.macroName,
        value: run.generatedText.trim(),
      })),
  );

  const nonEmpty = rows.filter((entry) => entry.value);
  if (!nonEmpty.length) {
    return "-";
  }

  return nonEmpty.map((entry) => `${entry.date} • ${entry.macroName}\n${entry.value}`).join("\n\n");
}

function formatChargeLine(encounterDate: string, charge: EncounterChargeEntry, index: number) {
  const unitPrice = Number.isFinite(charge.unitPrice) ? charge.unitPrice : 0;
  const units = Number.isFinite(charge.units) ? charge.units : 1;
  const total = unitPrice * units;
  return `${index}. ${toUsDate(encounterDate)} | ${charge.procedureCode} | ${charge.name} | ${formatCurrency(unitPrice)} x ${units} = ${formatCurrency(total)}`;
}

function formatDiagnosisList(entries: NarrativeDiagnosisEntry[]) {
  if (!entries.length) {
    return "-";
  }
  return entries
    .map((entry, index) => `${index + 1}. ${entry.code} - ${entry.description}`)
    .join("\n");
}

function formatImagingRegions(entry: NarrativeImagingEntry) {
  if (!entry.regions.length) {
    return "-";
  }
  const flexExt = new Set(entry.flexExtRegions ?? []);
  return entry.regions
    .map((region) => {
      const laterality = entry.lateralityByRegion?.[region] ?? "";
      const lateralityLabel = laterality ? ` (${laterality})` : "";
      const flexExtLabel = flexExt.has(region) ? " Flex/Ext" : "";
      return `${region}${lateralityLabel}${flexExtLabel}`;
    })
    .join(", ");
}

function formatImagingSummary(entries: NarrativeImagingEntry[], fallbackLabel: string) {
  if (!entries.length) {
    return "-";
  }
  return entries
    .map((entry, index) => {
      const modality = entry.modalityLabel || fallbackLabel;
      const line = `${index + 1}. ${modality} | Completed: ${toUsDate(entry.doneDate || "-")} | Center: ${entry.center || "-"} | Regions: ${formatImagingRegions(entry)}`;
      const findings = entry.findings?.trim();
      return findings ? `${line}\n   Findings: ${findings}` : line;
    })
    .join("\n");
}

function formatSpecialistSummary(entries: NarrativeSpecialistEntry[]) {
  if (!entries.length) {
    return "-";
  }
  return entries
    .map((entry, index) => {
      const line = `${index + 1}. ${entry.specialist || "-"} | Sent: ${toUsDate(entry.sentDate || "-")} | Completed: ${toUsDate(entry.completedDate || "-")}`;
      const recs = entry.recommendations?.trim();
      return recs ? `${line}\n   Recommendations: ${recs}` : line;
    })
    .join("\n");
}

export function appointmentTypeToTokenPrefix(typeName: string) {
  return typeName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatAmount(value: string) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    return "";
  }
  return numeric.toFixed(2);
}

// ---------------------------------------------------------------------------
// Decompression Treatment Summary builder
// ---------------------------------------------------------------------------

interface DecompressionGroup {
  typeName: string;          // e.g. "cervical spinal decompression"
  count: number;
  segments: string[];        // deduplicated, ordered
  weights: number[];         // chronological (first encounter → last)
}

function toSentenceCase(text: string) {
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Extracts unique segment values from all macro runs in a single encounter.
 * Handles both single-string and string-array answer values for the
 * `targeted_segment` key (case-insensitive key match).
 */
function extractSegments(encounter: EncounterNoteRecord): string[] {
  const segments: string[] = [];
  for (const run of encounter.macroRuns) {
    for (const [key, value] of Object.entries(run.answers)) {
      if (key.toLowerCase().replace(/[\s_-]+/g, "") !== "targetedsegment") continue;
      if (typeof value === "string" && value.trim()) {
        segments.push(value.trim());
      } else if (Array.isArray(value)) {
        for (const v of value) {
          if (typeof v === "string" && v.trim()) segments.push(v.trim());
        }
      }
    }
  }
  return segments;
}

/**
 * Extracts the decompression/traction weight from an encounter's macro runs.
 * Only looks at macro runs whose name contains "decompression" or "traction"
 * to avoid picking up the patient's body weight from general exam macros.
 * Returns the numeric weight or null if not found.
 */
function extractWeight(encounter: EncounterNoteRecord): number | null {
  // First pass: only look at decompression/traction-related macros
  for (const run of encounter.macroRuns) {
    const macroNameNorm = run.macroName.toLowerCase();
    if (!/decompression|traction/i.test(macroNameNorm)) continue;
    for (const [key, value] of Object.entries(run.answers)) {
      if (key.toLowerCase().replace(/[\s_-]+/g, "") !== "weight") continue;
      const str = typeof value === "string" ? value : Array.isArray(value) ? value[0] : null;
      if (!str) continue;
      const num = parseFloat(str);
      if (Number.isFinite(num) && num > 0) return num;
    }
  }
  // Second pass: look for keys that explicitly mention decompression/traction weight
  for (const run of encounter.macroRuns) {
    for (const [key, value] of Object.entries(run.answers)) {
      const normKey = key.toLowerCase().replace(/[\s_-]+/g, "");
      if (
        normKey === "decompressionweight" ||
        normKey === "tractionweight" ||
        normKey === "treatmentweight" ||
        normKey === "pullingweight"
      ) {
        const str = typeof value === "string" ? value : Array.isArray(value) ? value[0] : null;
        if (!str) continue;
        const num = parseFloat(str);
        if (Number.isFinite(num) && num > 0) return num;
      }
    }
  }
  return null;
}

function buildDecompressionSummary(
  encountersAsc: EncounterNoteRecord[],
  patientFullName: string,
): string {
  // Only closed encounters with "decompression" in appointment type
  const decomp = encountersAsc.filter(
    (e) => e.signed && /decompression/i.test(e.appointmentType),
  );

  if (!decomp.length) return "-";

  // Group by appointment type (case-insensitive normalized key)
  const groupMap = new Map<string, EncounterNoteRecord[]>();
  for (const enc of decomp) {
    const key = enc.appointmentType.trim().toLowerCase();
    const list = groupMap.get(key) ?? [];
    list.push(enc);
    groupMap.set(key, list);
  }

  const groups: DecompressionGroup[] = [];
  for (const [, encounters] of groupMap) {
    // Use the first encounter's appointmentType for display (preserves original casing)
    const typeName = encounters[0].appointmentType;

    // Deduplicate segments across all encounters in this group
    const allSegments: string[] = [];
    for (const enc of encounters) {
      allSegments.push(...extractSegments(enc));
    }
    const uniqueSegments = [...new Set(allSegments)];

    // Collect weights chronologically (encounters are already sorted asc)
    const weights: number[] = [];
    for (const enc of encounters) {
      const w = extractWeight(enc);
      if (w !== null) weights.push(w);
    }

    groups.push({
      typeName,
      count: encounters.length,
      segments: uniqueSegments,
      weights,
    });
  }

  // Build the patient's last name for "Mr./Mrs." — fall back to full name
  const nameParts = patientFullName.trim().split(/\s+/);
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : patientFullName;

  const sentences: string[] = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const prefix = i === 0
      ? `${patientFullName} completed`
      : `${patientFullName} also completed`;

    const typeLabel = toSentenceCase(g.typeName);

    // Segments clause
    const segmentClause = g.segments.length
      ? `, targeting the ${g.segments.join(", ")} segment${g.segments.length > 1 ? "s" : ""}`
      : "";

    // Weight clause
    let weightClause = "";
    if (g.weights.length > 0) {
      const firstWeight = g.weights[0];
      const lastWeight = g.weights[g.weights.length - 1];
      if (firstWeight === lastWeight || g.weights.length === 1) {
        weightClause = ` at ${firstWeight} pounds`;
      } else {
        weightClause = `. Treatment began with ${firstWeight} pounds and ended with ${lastWeight} pounds`;
      }
    }

    const sentence = `${prefix} ${g.count} treatment${g.count !== 1 ? "s" : ""} of ${typeLabel}${segmentClause}${weightClause}.`;
    sentences.push(sentence);
  }

  return sentences.join(" ");
}

/** Convert ISO YYYY-MM-DD to US MM/DD/YYYY; pass through if already US format or empty. */
function toUsDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split("-");
    return `${m}/${d}/${y}`;
  }
  return trimmed;
}

export function buildNarrativeReportContext(input: NarrativeReportBuildInput) {
  const encountersAsc = [...input.encounters].sort(
    (left, right) => toSortStamp(left.encounterDate) - toSortStamp(right.encounterDate),
  );
  const firstEncounter = encountersAsc[0] ?? null;
  const latestEncounter = encountersAsc.at(-1) ?? null;

  const allCharges = encountersAsc.flatMap((entry) =>
    entry.charges.map((charge) => ({ encounterDate: entry.encounterDate, charge })),
  );

  const chargeLedger = allCharges.length
    ? allCharges.map((entry, index) => formatChargeLine(entry.encounterDate, entry.charge, index + 1)).join("\n")
    : "-";

  const totalChargeAmount = allCharges.reduce((total, entry) => {
    const unitPrice = Number.isFinite(entry.charge.unitPrice) ? entry.charge.unitPrice : 0;
    const units = Number.isFinite(entry.charge.units) ? entry.charge.units : 1;
    return total + unitPrice * units;
  }, 0);

  const billedAmountValue = Number.parseFloat(input.additional.billedAmount);
  const paidAmountValue = Number.parseFloat(input.additional.paidAmount);
  const percentagePaid =
    Number.isFinite(billedAmountValue) &&
    billedAmountValue > 0 &&
    Number.isFinite(paidAmountValue) &&
    paidAmountValue >= 0
      ? `${((paidAmountValue / billedAmountValue) * 100).toFixed(1)}%`
      : "-";

  const encounterTimeline = encountersAsc.length
    ? encountersAsc
        .map(
          (entry, index) =>
            `${index + 1}. ${toUsDate(entry.encounterDate)} | ${entry.appointmentType} | ${entry.provider} | ${
              entry.signed ? "Closed" : "Open"
            }`,
        )
        .join("\n")
    : "-";

  const context: Record<string, string> = {
    TODAY_DATE: getTodayUsDate(),
    OFFICE_NAME: input.office.officeName,
    OFFICE_ADDRESS: input.office.address,
    OFFICE_PHONE: input.office.phone,
    OFFICE_FAX: input.office.fax,
    OFFICE_EMAIL: input.office.email,
    DOCTOR_NAME: input.office.doctorName,

    PATIENT_FULL_NAME: input.patient.fullName,
    PATIENT_FIRST_NAME: input.patient.firstName,
    PATIENT_LAST_NAME: input.patient.lastName,
    PATIENT_DOB: toUsDate(input.patient.dob),
    PATIENT_PHONE: input.patient.phone,
    PATIENT_EMAIL: input.patient.email,
    DATE_OF_INJURY: toUsDate(input.patient.dateOfLoss),
    INITIAL_EXAM: toUsDate(input.patient.initialExam),
    CASE_NUMBER: input.patient.caseNumber,
    ATTORNEY_NAME: input.patient.attorney,
    ATTORNEY_PHONE: input.patient.attorneyPhone,
    ATTORNEY_FAX: input.patient.attorneyFax,
    ATTORNEY_EMAIL: input.patient.attorneyEmail,
    ATTORNEY_ADDRESS: input.patient.attorneyAddress,
    CASE_STATUS: input.patient.caseStatus,
    LIEN_STATUS: input.patient.lienStatus,
    PRIOR_CARE: input.patient.priorCare,
    PATIENT_NOTES: input.patient.patientNotes,
    XRAY_FINDINGS: input.patient.xrayFindings,
    MRI_CT_FINDINGS: input.patient.mriCtFindings,
    SPECIALIST_RECOMMENDATIONS: input.patient.specialistRecommendations,
    MR_MRS_MS_LAST_NAME: input.patient.mrMrsMsLastName,
    HE_SHE: input.patient.heShe,
    HIS_HER: input.patient.hisHer,

    DISCHARGE_DATE: toUsDate(input.additional.dischargeDate),
    RB_SENT_DATE: toUsDate(input.additional.rbSentDate),
    PAID_DATE: toUsDate(input.additional.paidDate),
    BILLED_AMOUNT: formatAmount(input.additional.billedAmount),
    PAID_AMOUNT: formatAmount(input.additional.paidAmount),
    REVIEW_STATUS: input.additional.reviewStatus,
    PERCENTAGE_PAID: percentagePaid,

    ENCOUNTER_COUNT: `${encountersAsc.length}`,
    FIRST_ENCOUNTER_DATE: toUsDate(firstEncounter?.encounterDate ?? "-"),
    LATEST_ENCOUNTER_DATE: toUsDate(latestEncounter?.encounterDate ?? "-"),

    FIRST_SUBJECTIVE: firstEncounter?.soap.subjective.trim() || "-",
    FIRST_OBJECTIVE: firstEncounter?.soap.objective.trim() || "-",
    FIRST_ASSESSMENT: firstEncounter?.soap.assessment.trim() || "-",
    FIRST_PLAN: firstEncounter?.soap.plan.trim() || "-",

    LATEST_SUBJECTIVE: latestEncounter?.soap.subjective.trim() || "-",
    LATEST_OBJECTIVE: latestEncounter?.soap.objective.trim() || "-",
    LATEST_ASSESSMENT: latestEncounter?.soap.assessment.trim() || "-",
    LATEST_PLAN: latestEncounter?.soap.plan.trim() || "-",

    ALL_SUBJECTIVE: formatSoapRollup(encountersAsc, "subjective"),
    ALL_OBJECTIVE: formatSoapRollup(encountersAsc, "objective"),
    ALL_ASSESSMENT: formatSoapRollup(encountersAsc, "assessment"),
    ALL_PLAN: formatSoapRollup(encountersAsc, "plan"),

    MACRO_SUBJECTIVE: formatMacroRollup(encountersAsc, "subjective"),
    MACRO_OBJECTIVE: formatMacroRollup(encountersAsc, "objective"),
    MACRO_ASSESSMENT: formatMacroRollup(encountersAsc, "assessment"),
    MACRO_PLAN: formatMacroRollup(encountersAsc, "plan"),

    ENCOUNTER_TIMELINE: encounterTimeline,
    DIAGNOSIS_LIST: formatDiagnosisList(input.diagnoses),
    DIAGNOSIS_CODES: input.diagnoses.map((entry) => entry.code).join(", "),
    CHARGE_LEDGER: chargeLedger,
    TOTAL_CHARGE_AMOUNT: formatCurrency(totalChargeAmount),

    XRAY_SUMMARY: formatImagingSummary(input.xrayReferrals, "X-Ray"),
    XRAY_SENT_DATE: toUsDate(input.xrayReferrals[0]?.sentDate || "-"),
    XRAY_COMPLETED_DATE: toUsDate(input.xrayReferrals[0]?.doneDate || "-"),
    XRAY_REVIEWED_DATE: toUsDate(input.xrayReferrals[0]?.reportReviewedDate || "-"),
    MRI_CT_SUMMARY: formatImagingSummary(input.mriReferrals, "MRI/CT"),
    MRI_SENT_DATE: toUsDate(input.mriReferrals[0]?.sentDate || "-"),
    MRI_SCHEDULED_DATE: toUsDate(input.mriReferrals[0]?.scheduledDate || "-"),
    MRI_COMPLETED_DATE: toUsDate(input.mriReferrals[0]?.doneDate || "-"),
    MRI_REVIEWED_DATE: toUsDate(input.mriReferrals[0]?.reportReviewedDate || "-"),
    IMAGING_SUMMARY: [
      "X-Ray:",
      formatImagingSummary(input.xrayReferrals, "X-Ray"),
      "",
      "MRI/CT:",
      formatImagingSummary(input.mriReferrals, "MRI/CT"),
    ].join("\n"),
    SPECIALIST_SUMMARY: formatSpecialistSummary(input.specialistReferrals),
  };

  // ── Numbered specialist tokens (SPECIALIST_1_NAME … SPECIALIST_10_RECOMMENDATIONS) ──
  for (let i = 0; i < 10; i++) {
    const n = i + 1;
    const sp = input.specialistReferrals[i] ?? null;
    context[`SPECIALIST_${n}_NAME`] = sp?.specialist || "-";
    context[`SPECIALIST_${n}_SENT`] = toUsDate(sp?.sentDate || "-");
    context[`SPECIALIST_${n}_COMPLETED`] = toUsDate(sp?.completedDate || "-");
    context[`SPECIALIST_${n}_RECOMMENDATIONS`] = sp?.recommendations?.trim() || "-";
  }

  // ── Numbered encounter tokens (ENCOUNTER_1_SUBJECTIVE … ENCOUNTER_20_PLAN) ──
  for (let i = 0; i < 20; i++) {
    const n = i + 1;
    const enc = encountersAsc[i] ?? null;
    context[`ENCOUNTER_${n}_SUBJECTIVE`] = enc?.soap.subjective.trim() || "-";
    context[`ENCOUNTER_${n}_OBJECTIVE`] = enc?.soap.objective.trim() || "-";
    context[`ENCOUNTER_${n}_ASSESSMENT`] = enc?.soap.assessment.trim() || "-";
    context[`ENCOUNTER_${n}_PLAN`] = enc?.soap.plan.trim() || "-";
    context[`ENCOUNTER_${n}_DATE`] = toUsDate(enc?.encounterDate ?? "-");
    context[`ENCOUNTER_${n}_TYPE`] = enc?.appointmentType ?? "-";
  }

  // ── Appointment-type encounter tokens (e.g. PERSONAL_INJURY_RE_EXAM_1_SUBJECTIVE) ──
  const encountersByType = new Map<string, typeof encountersAsc>();
  for (const enc of encountersAsc) {
    const key = appointmentTypeToTokenPrefix(enc.appointmentType);
    if (!key) continue;
    const group = encountersByType.get(key) ?? [];
    group.push(enc);
    encountersByType.set(key, group);
  }
  for (const [typeKey, group] of encountersByType) {
    for (let i = 0; i < Math.min(group.length, 20); i++) {
      const n = i + 1;
      const enc = group[i];
      context[`${typeKey}_${n}_SUBJECTIVE`] = enc.soap.subjective.trim() || "-";
      context[`${typeKey}_${n}_OBJECTIVE`] = enc.soap.objective.trim() || "-";
      context[`${typeKey}_${n}_ASSESSMENT`] = enc.soap.assessment.trim() || "-";
      context[`${typeKey}_${n}_PLAN`] = enc.soap.plan.trim() || "-";
      context[`${typeKey}_${n}_DATE`] = toUsDate(enc.encounterDate);
      context[`${typeKey}_${n}_TYPE`] = enc.appointmentType;
    }
  }

  // ── Decompression Treatment Summary ──
  context.DECOMPRESSION_SUMMARY = buildDecompressionSummary(encountersAsc, input.patient.fullName);

  encounterSections.forEach((section) => {
    context[`FIRST_${section.toUpperCase()}`] =
      firstEncounter?.soap[section].trim() || context[`FIRST_${section.toUpperCase()}`] || "-";
    context[`LATEST_${section.toUpperCase()}`] =
      latestEncounter?.soap[section].trim() || context[`LATEST_${section.toUpperCase()}`] || "-";
    context[`ALL_${section.toUpperCase()}`] =
      context[`ALL_${section.toUpperCase()}`] || formatSoapRollup(encountersAsc, section);
    context[`MACRO_${section.toUpperCase()}`] =
      context[`MACRO_${section.toUpperCase()}`] || formatMacroRollup(encountersAsc, section);
  });

  if (input.promptValues) {
    Object.entries(input.promptValues).forEach(([token, value]) => {
      if (!token.trim()) {
        return;
      }
      context[token.trim().toUpperCase()] = value;
    });
  }

  return context;
}

export function renderNarrativeReportBody(templateBody: string, context: Record<string, string>) {
  return renderDocumentTemplate(templateBody, context);
}
