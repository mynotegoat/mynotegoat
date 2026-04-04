import type {
  MriCtClearCondition,
  SpecialistAppearWhen,
  SpecialistClearCondition,
  XrayClearCondition,
} from "@/lib/dashboard-workspace-settings";
import type { PatientRecord } from "@/lib/mock-data";
import type { PatientFollowUpOverrideMap } from "@/lib/patient-follow-up-overrides";

export type FollowUpCategory = "X-Ray" | "MRI / CT" | "Specialist" | "Lien / LOP";

export type FollowUpItem = {
  id: string;
  patientId: string;
  patientName: string;
  caseNumber: string;
  attorney: string;
  caseStatus: string;
  category: FollowUpCategory;
  stage: string;
  anchorDate: string;
  daysFromAnchor: number | null;
  note: string;
};

export type FollowUpQueueOptions = {
  includeXray?: boolean;
  includeMriCt?: boolean;
  includeSpecialist?: boolean;
  includeLienLop?: boolean;
  xrayAppearAuto?: boolean;
  mriAppearAuto?: boolean;
  mriAppearDays?: number;
  specialistAppearWhen?: SpecialistAppearWhen;
  xrayClearedBy?: XrayClearCondition[];
  mriCtClearedBy?: MriCtClearCondition[];
  specialistClearedBy?: SpecialistClearCondition[];
  lienLopClearStatuses?: string[];
  followUpOverrides?: PatientFollowUpOverrideMap;
  maxItems?: number;
  closedCaseStatuses?: string[];
};

export function formatUsDateDisplay(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") {
    return value;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}`;
  }

  const usShortMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (usShortMatch) {
    const month = usShortMatch[1].padStart(2, "0");
    const day = usShortMatch[2].padStart(2, "0");
    const year = `20${usShortMatch[3]}`;
    return `${month}/${day}/${year}`;
  }

  const usLongMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usLongMatch) {
    const month = usLongMatch[1].padStart(2, "0");
    const day = usLongMatch[2].padStart(2, "0");
    return `${month}/${day}/${usLongMatch[3]}`;
  }

  return value;
}

export function formatLeadingDateDisplay(value: string) {
  const match = value.match(/^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})(.*)$/);
  if (!match) {
    return value;
  }
  return `${formatUsDateDisplay(match[1])}${match[2]}`;
}

export function hasMatrixValue(value: string | undefined) {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 && normalized !== "-";
}

export function toUsDateCanonical(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}`;
  }
  const usShortMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (usShortMatch) {
    return `${usShortMatch[1].padStart(2, "0")}/${usShortMatch[2].padStart(2, "0")}/20${usShortMatch[3]}`;
  }
  const usLongMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usLongMatch) {
    return `${usLongMatch[1].padStart(2, "0")}/${usLongMatch[2].padStart(2, "0")}/${usLongMatch[3]}`;
  }
  return "";
}

export function extractLeadingDatePart(value: string | undefined) {
  const normalized = (value ?? "").trim();
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (!match) {
    return "";
  }
  return toUsDateCanonical(match[1]);
}

export function stripLeadingDatePart(value: string | undefined) {
  const normalized = (value ?? "").trim();
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\s*(.*)$/);
  if (!match) {
    return normalized;
  }
  return match[2].trim();
}

export function toDateStampFromUs(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return 0;
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const stamp = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}

export function getDaysFromToday(usDate: string) {
  const stamp = toDateStampFromUs(usDate);
  if (!stamp) {
    return null;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = today.getTime() - stamp;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function buildCaseNumber(dateOfLoss: string, fullName: string) {
  const formattedDate = toUsDateCanonical(dateOfLoss);
  const dateMatch = formattedDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!dateMatch) {
    return "";
  }
  const [lastName = "", firstName = ""] = fullName.split(",").map((entry) => entry.trim());
  const month = dateMatch[1];
  const day = dateMatch[2];
  const year = dateMatch[3].slice(-2);
  const cleanLast = lastName.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2);
  const cleanFirst = firstName.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2);
  return `${month}${day}${year}${cleanLast}${cleanFirst}`;
}

function cleanAttorneyLabel(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function buildNormalizedStatusSet(statuses: string[]) {
  return new Set(statuses.map((status) => status.trim().toLowerCase()).filter(Boolean));
}

function matchesLienClearStatus(lienRaw: string, clearStatuses: Set<string>) {
  if (!clearStatuses.size) {
    return false;
  }
  const normalizedLien = lienRaw.trim().toLowerCase();
  if (!normalizedLien) {
    return false;
  }
  for (const status of clearStatuses) {
    if (normalizedLien === status || normalizedLien.includes(status)) {
      return true;
    }
  }
  return false;
}

function isXrayCleared(
  clearedBy: Set<string>,
  overrides: { patientRefused: boolean; completedPriorCare: boolean; notNeeded: boolean } | undefined,
  xrayReviewedHasValue: boolean,
) {
  if (clearedBy.has("patientRefused") && overrides?.patientRefused) return true;
  if (clearedBy.has("completedPriorCare") && overrides?.completedPriorCare) return true;
  if (clearedBy.has("reviewed") && xrayReviewedHasValue) return true;
  if (clearedBy.has("noXray") && overrides?.notNeeded) return true;
  return false;
}

function isMriCtCleared(
  clearedBy: Set<string>,
  overrides: { patientRefused: boolean; completedPriorCare: boolean; notNeeded: boolean } | undefined,
  mriReviewedHasValue: boolean,
) {
  if (clearedBy.has("patientRefused") && overrides?.patientRefused) return true;
  if (clearedBy.has("completedPriorCare") && overrides?.completedPriorCare) return true;
  if (clearedBy.has("reviewed") && mriReviewedHasValue) return true;
  if (clearedBy.has("noMri") && overrides?.notNeeded) return true;
  return false;
}

function isSpecialistCleared(
  clearedBy: Set<string>,
  overrides: { patientRefused: boolean; completedPriorCare: boolean; notNeeded: boolean } | undefined,
  specialistReportHasValue: boolean,
) {
  if (clearedBy.has("patientRefused") && overrides?.patientRefused) return true;
  if (clearedBy.has("completedPriorCare") && overrides?.completedPriorCare) return true;
  if (clearedBy.has("report") && specialistReportHasValue) return true;
  if (clearedBy.has("noPm") && overrides?.notNeeded) return true;
  return false;
}

export function buildFollowUpItems(
  patientRows: PatientRecord[],
  options: FollowUpQueueOptions = {},
) {
  const includeXray = options.includeXray ?? true;
  const includeMriCt = options.includeMriCt ?? true;
  const includeSpecialist = options.includeSpecialist ?? true;
  const includeLienLop = options.includeLienLop ?? true;

  const xrayAppearAuto = options.xrayAppearAuto ?? true;
  const mriAppearAuto = options.mriAppearAuto ?? true;
  const mriAppearDays = options.mriAppearDays ?? 21;
  const specialistAppearWhen = options.specialistAppearWhen ?? "mri_sent";

  const xrayClearedBySet = new Set<string>(options.xrayClearedBy ?? ["patientRefused", "completedPriorCare", "reviewed", "noXray"]);
  const mriCtClearedBySet = new Set<string>(options.mriCtClearedBy ?? ["patientRefused", "completedPriorCare", "reviewed", "noMri"]);
  const specialistClearedBySet = new Set<string>(options.specialistClearedBy ?? ["patientRefused", "completedPriorCare", "report", "noPm"]);

  const lienLopClearStatuses = buildNormalizedStatusSet(options.lienLopClearStatuses ?? []);
  const followUpOverrides = options.followUpOverrides ?? {};
  const maxItems =
    typeof options.maxItems === "number" && Number.isFinite(options.maxItems)
      ? Math.max(1, Math.round(options.maxItems))
      : null;
  const closedStatuses = new Set(
    (options.closedCaseStatuses ?? []).map((statusName) => statusName.trim().toLowerCase()).filter(Boolean),
  );

  const rows: FollowUpItem[] = [];

  patientRows.forEach((patient) => {
    if (closedStatuses.has(patient.caseStatus.trim().toLowerCase())) {
      return;
    }

    const matrix = patient.matrix ?? {};
    const caseNumber = buildCaseNumber(patient.dateOfLoss, patient.fullName);

    const xraySentRaw = matrix.xraySent ?? "";
    const xrayDoneRaw = matrix.xrayDone ?? "";
    const xrayReceivedRaw = matrix.xrayReceived ?? "";
    const xrayReviewedRaw = matrix.xrayReviewed ?? "";

    const mriSentRaw = matrix.mriSent ?? "";
    const mriScheduledRaw = matrix.mriScheduled ?? "";
    const mriDoneRaw = matrix.mriDone ?? "";
    const mriReceivedRaw = matrix.mriReceived ?? "";
    const mriReviewedRaw = matrix.mriReviewed ?? "";

    const specialistSentRaw = matrix.specialistSent ?? "";
    const specialistScheduledRaw = matrix.specialistScheduled ?? "";
    const specialistReportRaw = matrix.specialistReport ?? "";
    const lienRaw = matrix.lien ?? "";
    const initialExamRaw = matrix.initialExam ?? "";

    const patientOverrides = followUpOverrides[patient.id];

    // --- X-Ray ---
    if (includeXray) {
      const xrayCleared = isXrayCleared(xrayClearedBySet, patientOverrides?.xray, hasMatrixValue(xrayReviewedRaw));

      if (!xrayCleared) {
        const hasSent = hasMatrixValue(xraySentRaw);
        const hasDone = hasMatrixValue(xrayDoneRaw);
        const hasReceived = hasMatrixValue(xrayReceivedRaw);

        if (xrayAppearAuto && !hasSent) {
          // Auto-appear: X-Ray not started yet
          const anchorDate = toUsDateCanonical(patient.dateOfLoss);
          rows.push({
            id: `${patient.id}-xray-needs-sent`,
            patientId: patient.id,
            patientName: patient.fullName,
            caseNumber,
            attorney: cleanAttorneyLabel(patient.attorney),
            caseStatus: patient.caseStatus,
            category: "X-Ray",
            stage: "Needs to be sent",
            anchorDate,
            daysFromAnchor: getDaysFromToday(anchorDate),
            note: "",
          });
        } else if (hasSent && !hasDone) {
          const sentDate = extractLeadingDatePart(xraySentRaw);
          rows.push({
            id: `${patient.id}-xray-done`,
            patientId: patient.id,
            patientName: patient.fullName,
            caseNumber,
            attorney: cleanAttorneyLabel(patient.attorney),
            caseStatus: patient.caseStatus,
            category: "X-Ray",
            stage: "Sent, waiting for done date",
            anchorDate: sentDate,
            daysFromAnchor: getDaysFromToday(sentDate),
            note: stripLeadingDatePart(xraySentRaw),
          });
        } else if (hasDone && !hasReceived) {
          const doneDate = extractLeadingDatePart(xrayDoneRaw);
          rows.push({
            id: `${patient.id}-xray-report-received`,
            patientId: patient.id,
            patientName: patient.fullName,
            caseNumber,
            attorney: cleanAttorneyLabel(patient.attorney),
            caseStatus: patient.caseStatus,
            category: "X-Ray",
            stage: "Done, waiting for report received",
            anchorDate: doneDate,
            daysFromAnchor: getDaysFromToday(doneDate),
            note: "",
          });
        } else if (hasReceived && !hasMatrixValue(xrayReviewedRaw)) {
          const receivedDate = extractLeadingDatePart(xrayReceivedRaw);
          rows.push({
            id: `${patient.id}-xray-review`,
            patientId: patient.id,
            patientName: patient.fullName,
            caseNumber,
            attorney: cleanAttorneyLabel(patient.attorney),
            caseStatus: patient.caseStatus,
            category: "X-Ray",
            stage: "Report received, waiting for review",
            anchorDate: receivedDate,
            daysFromAnchor: getDaysFromToday(receivedDate),
            note: "",
          });
        }
      }
    }

    // --- MRI / CT ---
    if (includeMriCt) {
      const mriCleared = isMriCtCleared(mriCtClearedBySet, patientOverrides?.mriCt, hasMatrixValue(mriReviewedRaw));

      if (!mriCleared) {
        const hasSent = hasMatrixValue(mriSentRaw);
        const hasDone = hasMatrixValue(mriDoneRaw);
        const hasReceived = hasMatrixValue(mriReceivedRaw);

        // Check appear rule for auto-appear
        let shouldAppear = hasSent; // always show if process started
        if (!hasSent && mriAppearAuto) {
          const initialDate = extractLeadingDatePart(initialExamRaw);
          if (initialDate) {
            const daysSinceInitial = getDaysFromToday(initialDate);
            if (daysSinceInitial !== null && daysSinceInitial >= mriAppearDays) {
              shouldAppear = true;
            }
          }
        }

        if (shouldAppear && !hasSent) {
          const anchorDate = extractLeadingDatePart(initialExamRaw) || toUsDateCanonical(patient.dateOfLoss);
          rows.push({
            id: `${patient.id}-mri-needs-sent`,
            patientId: patient.id,
            patientName: patient.fullName,
            caseNumber,
            attorney: cleanAttorneyLabel(patient.attorney),
            caseStatus: patient.caseStatus,
            category: "MRI / CT",
            stage: "MRI due — needs to be sent",
            anchorDate,
            daysFromAnchor: getDaysFromToday(anchorDate),
            note: "",
          });
        } else if (hasSent && !hasDone) {
          const scheduledDate = extractLeadingDatePart(mriScheduledRaw);
          const sentDate = extractLeadingDatePart(mriSentRaw);
          rows.push({
            id: `${patient.id}-mri-done`,
            patientId: patient.id,
            patientName: patient.fullName,
            caseNumber,
            attorney: cleanAttorneyLabel(patient.attorney),
            caseStatus: patient.caseStatus,
            category: "MRI / CT",
            stage: scheduledDate
              ? `Scheduled ${formatUsDateDisplay(scheduledDate)}, waiting for done date`
              : "Sent, waiting for done date",
            anchorDate: scheduledDate || sentDate,
            daysFromAnchor: getDaysFromToday(scheduledDate || sentDate),
            note: stripLeadingDatePart(mriSentRaw),
          });
        } else if (hasDone && !hasReceived) {
          const doneDate = extractLeadingDatePart(mriDoneRaw);
          rows.push({
            id: `${patient.id}-mri-report-received`,
            patientId: patient.id,
            patientName: patient.fullName,
            caseNumber,
            attorney: cleanAttorneyLabel(patient.attorney),
            caseStatus: patient.caseStatus,
            category: "MRI / CT",
            stage: "Done, waiting for report received",
            anchorDate: doneDate,
            daysFromAnchor: getDaysFromToday(doneDate),
            note: "",
          });
        } else if (hasReceived && !hasMatrixValue(mriReviewedRaw)) {
          const receivedDate = extractLeadingDatePart(mriReceivedRaw);
          rows.push({
            id: `${patient.id}-mri-review`,
            patientId: patient.id,
            patientName: patient.fullName,
            caseNumber,
            attorney: cleanAttorneyLabel(patient.attorney),
            caseStatus: patient.caseStatus,
            category: "MRI / CT",
            stage: "Report received, waiting for review",
            anchorDate: receivedDate,
            daysFromAnchor: getDaysFromToday(receivedDate),
            note: "",
          });
        }
      }
    }

    // --- Specialist ---
    if (includeSpecialist) {
      const specCleared = isSpecialistCleared(specialistClearedBySet, patientOverrides?.specialist, hasMatrixValue(specialistReportRaw));

      if (!specCleared) {
        const hasSent = hasMatrixValue(specialistSentRaw);
        const hasScheduled = hasMatrixValue(specialistScheduledRaw);

        // Specialist appear rule: show when MRI reaches a certain stage
        let specialistShouldAppear = hasSent; // always show if referral started
        if (!hasSent) {
          if (specialistAppearWhen === "mri_sent" && hasMatrixValue(mriSentRaw)) {
            specialistShouldAppear = true;
          } else if (specialistAppearWhen === "mri_reviewed" && hasMatrixValue(mriReviewedRaw)) {
            specialistShouldAppear = true;
          }
        }

        if (specialistShouldAppear && !hasSent) {
          const anchorDate = extractLeadingDatePart(mriSentRaw) || toUsDateCanonical(patient.dateOfLoss);
          rows.push({
            id: `${patient.id}-specialist-needs-sent`,
            patientId: patient.id,
            patientName: patient.fullName,
            caseNumber,
            attorney: cleanAttorneyLabel(patient.attorney),
            caseStatus: patient.caseStatus,
            category: "Specialist",
            stage: "Referral needs to be sent",
            anchorDate,
            daysFromAnchor: getDaysFromToday(anchorDate),
            note: "",
          });
        } else if (hasSent && !hasScheduled) {
          const sentDate = extractLeadingDatePart(specialistSentRaw);
          rows.push({
            id: `${patient.id}-specialist-scheduled`,
            patientId: patient.id,
            patientName: patient.fullName,
            caseNumber,
            attorney: cleanAttorneyLabel(patient.attorney),
            caseStatus: patient.caseStatus,
            category: "Specialist",
            stage: "Referral sent, waiting for scheduled date",
            anchorDate: sentDate,
            daysFromAnchor: getDaysFromToday(sentDate),
            note: stripLeadingDatePart(specialistSentRaw),
          });
        } else if (hasScheduled && !hasMatrixValue(specialistReportRaw)) {
          const scheduledDate = extractLeadingDatePart(specialistScheduledRaw);
          rows.push({
            id: `${patient.id}-specialist-report`,
            patientId: patient.id,
            patientName: patient.fullName,
            caseNumber,
            attorney: cleanAttorneyLabel(patient.attorney),
            caseStatus: patient.caseStatus,
            category: "Specialist",
            stage: "Scheduled, waiting for specialist report",
            anchorDate: scheduledDate,
            daysFromAnchor: getDaysFromToday(scheduledDate),
            note: stripLeadingDatePart(specialistSentRaw),
          });
        }
      }
    }

    // --- Lien / LOP ---
    if (includeLienLop) {
      const normalizedLien = lienRaw.trim().toLowerCase();
      const lienHasValue = hasMatrixValue(lienRaw);
      const isSelectedClearStatus = matchesLienClearStatus(lienRaw, lienLopClearStatuses);
      const isNotSent =
        !lienHasValue || normalizedLien === "not set" || normalizedLien === "not sent";
      const isReceived =
        normalizedLien.includes("received") ||
        normalizedLien.includes("complete") ||
        normalizedLien.includes("resolved");

      if (!isSelectedClearStatus && (isNotSent || !isReceived)) {
        const stage = isNotSent
          ? "Not sent yet"
          : normalizedLien.includes("request")
            ? "Requested, waiting for received"
            : "Sent, waiting for received";
        const anchorDate =
          extractLeadingDatePart(lienRaw) ||
          extractLeadingDatePart(initialExamRaw) ||
          toUsDateCanonical(patient.dateOfLoss);
        rows.push({
          id: `${patient.id}-lien-follow-up`,
          patientId: patient.id,
          patientName: patient.fullName,
          caseNumber,
          attorney: cleanAttorneyLabel(patient.attorney),
          caseStatus: patient.caseStatus,
          category: "Lien / LOP",
          stage,
          anchorDate,
          daysFromAnchor: getDaysFromToday(anchorDate),
          note: isNotSent ? "" : stripLeadingDatePart(lienRaw),
        });
      }
    }
  });

  const sorted = rows.sort((left, right) => {
    const leftDays = left.daysFromAnchor ?? -99999;
    const rightDays = right.daysFromAnchor ?? -99999;
    if (leftDays !== rightDays) {
      return rightDays - leftDays;
    }
    const leftDate = toDateStampFromUs(left.anchorDate);
    const rightDate = toDateStampFromUs(right.anchorDate);
    if (leftDate !== rightDate) {
      return leftDate - rightDate;
    }
    return left.patientName.localeCompare(right.patientName);
  });

  return maxItems ? sorted.slice(0, maxItems) : sorted;
}
