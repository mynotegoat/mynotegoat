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
};

type NarrativeSpecialistEntry = {
  specialist: string;
  sentDate: string;
  scheduledDate: string;
  completedDate?: string;
  reportReceivedDate: string;
  reportReviewedDate?: string;
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
    .map((entry) => `${entry.date} (${entry.appointmentType})\n${entry.value}`)
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
  return `${index}. ${encounterDate} | ${charge.procedureCode} | ${charge.name} | ${formatCurrency(unitPrice)} x ${units} = ${formatCurrency(total)}`;
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
      return `${index + 1}. ${modality} | Sent: ${entry.sentDate || "-"} | Done: ${entry.doneDate || "-"} | Center: ${entry.center || "-"} | Regions: ${formatImagingRegions(entry)} | Report Received: ${entry.reportReceivedDate || "-"} | Report Reviewed: ${entry.reportReviewedDate || "-"}`;
    })
    .join("\n");
}

function formatSpecialistSummary(entries: NarrativeSpecialistEntry[]) {
  if (!entries.length) {
    return "-";
  }
  return entries
    .map(
      (entry, index) =>
        `${index + 1}. ${entry.specialist || "-"} | Sent: ${entry.sentDate || "-"} | Scheduled: ${entry.scheduledDate || "-"} | Report Received: ${entry.reportReceivedDate || "No"}`,
    )
    .join("\n");
}

function formatAmount(value: string) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    return "";
  }
  return numeric.toFixed(2);
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
            `${index + 1}. ${entry.encounterDate} | ${entry.appointmentType} | ${entry.provider} | ${
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
    PATIENT_DOB: input.patient.dob,
    PATIENT_PHONE: input.patient.phone,
    PATIENT_EMAIL: input.patient.email,
    DATE_OF_INJURY: input.patient.dateOfLoss,
    INITIAL_EXAM: input.patient.initialExam,
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

    DISCHARGE_DATE: input.additional.dischargeDate,
    RB_SENT_DATE: input.additional.rbSentDate,
    PAID_DATE: input.additional.paidDate,
    BILLED_AMOUNT: formatAmount(input.additional.billedAmount),
    PAID_AMOUNT: formatAmount(input.additional.paidAmount),
    REVIEW_STATUS: input.additional.reviewStatus,
    PERCENTAGE_PAID: percentagePaid,

    ENCOUNTER_COUNT: `${encountersAsc.length}`,
    FIRST_ENCOUNTER_DATE: firstEncounter?.encounterDate ?? "-",
    LATEST_ENCOUNTER_DATE: latestEncounter?.encounterDate ?? "-",

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
    XRAY_SENT_DATE: input.xrayReferrals[0]?.sentDate || "-",
    XRAY_COMPLETED_DATE: input.xrayReferrals[0]?.doneDate || "-",
    XRAY_REVIEWED_DATE: input.xrayReferrals[0]?.reportReviewedDate || "-",
    MRI_CT_SUMMARY: formatImagingSummary(input.mriReferrals, "MRI/CT"),
    MRI_SENT_DATE: input.mriReferrals[0]?.sentDate || "-",
    MRI_SCHEDULED_DATE: input.mriReferrals[0]?.scheduledDate || "-",
    MRI_COMPLETED_DATE: input.mriReferrals[0]?.doneDate || "-",
    MRI_REVIEWED_DATE: input.mriReferrals[0]?.reportReviewedDate || "-",
    IMAGING_SUMMARY: [
      "X-Ray:",
      formatImagingSummary(input.xrayReferrals, "X-Ray"),
      "",
      "MRI/CT:",
      formatImagingSummary(input.mriReferrals, "MRI/CT"),
    ].join("\n"),
    SPECIALIST_SUMMARY: formatSpecialistSummary(input.specialistReferrals),
  };

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
