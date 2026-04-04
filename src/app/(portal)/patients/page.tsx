"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useCaseStatuses } from "@/hooks/use-case-statuses";
import { useContactDirectory } from "@/hooks/use-contact-directory";
import { useDashboardWorkspaceSettings } from "@/hooks/use-dashboard-workspace-settings";
import { usePatientFollowUpOverrides } from "@/hooks/use-patient-follow-up-overrides";
import { getContrastTextColor, withAlpha } from "@/lib/color-utils";
import {
  buildFollowUpItems,
  formatLeadingDateDisplay,
  formatUsDateDisplay,
  type FollowUpCategory,
} from "@/lib/follow-up-queue";
import { createPatientRecord, patients, type PatientMatrixField, type PatientRecord } from "@/lib/mock-data";
import { formatUsPhoneInput } from "@/lib/phone-format";

type PatientView = "list" | "detail" | "followUp";

type DetailRow = {
  label: string;
  key: "attorney" | "dob" | "dateOfLoss" | PatientMatrixField;
};

type NewPatientDraft = {
  lastName: string;
  firstName: string;
  sex: PatientRecord["sex"] | "";
  maritalStatus: PatientRecord["maritalStatus"] | "";
  attorney: string;
  attorneyPhone: string;
  dob: string;
  dateOfLoss: string;
  initialExam: string;
  phone: string;
  email: string;
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
  lienStatus: string;
  priorCare: string;
  caseStatus: PatientRecord["caseStatus"];
};

const detailRowsTemplate: DetailRow[] = [
  { label: "Attorney", key: "attorney" },
  { label: "Contact", key: "contact" },
  { label: "DOB", key: "dob" },
  { label: "Date Of Loss", key: "dateOfLoss" },
  { label: "Initial Exam", key: "initialExam" },
  { label: "Lien", key: "lien" },
  { label: "Prior Care", key: "priorCare" },
  { label: "Xray Sent", key: "xraySent" },
  { label: "Xray Done", key: "xrayDone" },
  { label: "Xray Received", key: "xrayReceived" },
  { label: "Xray Reviewed", key: "xrayReviewed" },
  { label: "Re-Exam 1", key: "reExam1" },
  { label: "MRI Sent", key: "mriSent" },
  { label: "MRI Scheduled", key: "mriScheduled" },
  { label: "MRI Done", key: "mriDone" },
  { label: "MRI Received", key: "mriReceived" },
  { label: "MRI Reviewed", key: "mriReviewed" },
  { label: "Specialist Sent", key: "specialistSent" },
  { label: "Specialist Scheduled", key: "specialistScheduled" },
  { label: "Specialist Report", key: "specialistReport" },
  { label: "Re-Exam 2", key: "reExam2" },
  { label: "Re-Exam 3", key: "reExam3" },
  { label: "Discharge", key: "discharge" },
  { label: "R&B Sent", key: "rbSent" },
  { label: "Billed", key: "billed" },
  { label: "Initial To Discharge", key: "initialToDischarge" },
  { label: "Discharge To R&B", key: "dischargeToRb" },
  { label: "Paid Date", key: "paidDate" },
  { label: "R&B To Paid", key: "rbToPaid" },
  { label: "Paid Amount", key: "paidAmount" },
  { label: "Bill %", key: "billPercent" },
  { label: "Notes", key: "notes" },
  { label: "Review", key: "review" },
];

const dateMatrixFields = new Set<PatientMatrixField>([
  "initialExam",
  "xraySent",
  "xrayDone",
  "xrayReceived",
  "xrayReviewed",
  "reExam1",
  "mriSent",
  "mriScheduled",
  "mriDone",
  "mriReceived",
  "mriReviewed",
  "specialistSent",
  "specialistScheduled",
  "specialistReport",
  "reExam2",
  "reExam3",
  "discharge",
  "rbSent",
  "paidDate",
]);

function normalizeAttorneyKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanAttorneyLabel(value: string) {
  return value.trim().replace(/\s+/g, " ");
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

function buildCaseNumberPreview(dateOfLoss: string, lastName: string, firstName: string) {
  const dateDigits = dateOfLoss.replace(/\D/g, "");
  if (dateDigits.length < 8) {
    return "";
  }

  const lastInitials = lastName.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 2);
  const firstInitials = firstName.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 2);
  const mmddyy = `${dateDigits.slice(0, 2)}${dateDigits.slice(2, 4)}${dateDigits.slice(6, 8)}`;
  return `${mmddyy}${lastInitials}${firstInitials}`;
}

function composePatientAddress(street: string, city: string, state: string, zip: string) {
  const cleanStreet = street.trim();
  const cleanCity = city.trim();
  const cleanState = state.trim().toUpperCase();
  const cleanZip = zip.trim();

  const cityStateZip = [cleanCity, [cleanState, cleanZip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [cleanStreet, cityStateZip].filter(Boolean).join(", ");
}

function getFollowUpBadgeClass(category: FollowUpCategory) {
  if (category === "X-Ray") {
    return "bg-[rgba(13,121,191,0.14)] text-[#0d79bf]";
  }
  if (category === "MRI / CT") {
    return "bg-[rgba(97,73,179,0.14)] text-[#4d3d8f]";
  }
  if (category === "Lien / LOP") {
    return "bg-[rgba(90,119,168,0.16)] text-[#35537b]";
  }
  return "bg-[rgba(238,139,42,0.16)] text-[#9a5a00]";
}

function getAgePillClass(days: number | null, staleDaysThreshold: number) {
  const warningThreshold = Math.max(1, Math.floor(staleDaysThreshold / 2));
  if (days === null) {
    return "bg-[var(--bg-soft)] text-[var(--text-muted)]";
  }
  if (days >= staleDaysThreshold) {
    return "bg-[rgba(201,66,58,0.15)] text-[#b43b34]";
  }
  if (days >= warningThreshold) {
    return "bg-[rgba(238,139,42,0.16)] text-[#9a5a00]";
  }
  if (days >= 0) {
    return "bg-[rgba(25,109,58,0.12)] text-[#196d3a]";
  }
  return "bg-[rgba(13,121,191,0.14)] text-[#0d79bf]";
}

function getDetailValue(patient: PatientRecord, key: DetailRow["key"]) {
  if (key === "attorney") {
    return cleanAttorneyLabel(patient.attorney) || "-";
  }
  if (key === "dob") {
    return formatUsDateDisplay(patient.dob || "-");
  }
  if (key === "dateOfLoss") {
    return formatUsDateDisplay(patient.dateOfLoss || "-");
  }
  if (key === "contact") {
    return patient.matrix?.contact || patient.phone || "-";
  }
  const value = patient.matrix?.[key] || "-";
  if (dateMatrixFields.has(key)) {
    return formatLeadingDateDisplay(value);
  }
  return value;
}

export default function PatientsPage() {
  const router = useRouter();
  const { caseStatuses, lienLabel, lienOptions } = useCaseStatuses();
  const { contacts, addContact } = useContactDirectory();
  const { dashboardWorkspaceSettings } = useDashboardWorkspaceSettings();
  const { recordsByPatientId: followUpOverridesByPatientId } = usePatientFollowUpOverrides();
  const defaultCaseStatus = (caseStatuses[0]?.name ?? "Active") as PatientRecord["caseStatus"];
  const defaultLienOption = lienOptions[0] ?? "Not Set";
  const [view, setView] = useState<PatientView>("list");
  const [searchDraft, setSearchDraft] = useState("");
  const [yearDraft, setYearDraft] = useState("ALL");
  const [attorneyDraft, setAttorneyDraft] = useState("ALL");
  const [statusDraft, setStatusDraft] = useState("ALL");
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("ALL");
  const [attorney, setAttorney] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [showNewPatientModal, setShowNewPatientModal] = useState(false);
  const [newPatientMessage, setNewPatientMessage] = useState("");
  const [newPatientDraft, setNewPatientDraft] = useState<NewPatientDraft>({
    lastName: "",
    firstName: "",
    sex: "",
    maritalStatus: "",
    attorney: "",
    attorneyPhone: "",
    dob: "",
    dateOfLoss: "",
    initialExam: "",
    phone: "",
    email: "",
    addressStreet: "",
    addressCity: "",
    addressState: "",
    addressZip: "",
    lienStatus: defaultLienOption,
    priorCare: "",
    caseStatus: defaultCaseStatus,
  });

  const resetNewPatientDraft = () => {
    setNewPatientDraft({
      lastName: "",
      firstName: "",
      sex: "",
      maritalStatus: "",
      attorney: "",
      attorneyPhone: "",
      dob: "",
      dateOfLoss: "",
      initialExam: "",
      phone: "",
      email: "",
      addressStreet: "",
      addressCity: "",
      addressState: "",
      addressZip: "",
      lienStatus: defaultLienOption,
      priorCare: "",
      caseStatus: defaultCaseStatus,
    });
  };

  const openNewPatientModal = () => {
    setNewPatientMessage("");
    resetNewPatientDraft();
    setShowNewPatientModal(true);
  };

  const closeNewPatientModal = () => {
    setShowNewPatientModal(false);
    setNewPatientMessage("");
  };

  const attorneyContacts = useMemo(() => {
    const deduped = new Map<string, (typeof contacts)[number]>();
    contacts.forEach((contact) => {
      if (normalizeAttorneyKey(contact.category) !== "attorney") {
        return;
      }
      const key = normalizeAttorneyKey(contact.name);
      if (!key || deduped.has(key)) {
        return;
      }
      deduped.set(key, contact);
    });
    return Array.from(deduped.values());
  }, [contacts]);

  const createNewPatient = () => {
    const firstName = newPatientDraft.firstName.trim();
    const lastName = newPatientDraft.lastName.trim();
    if (!firstName || !lastName) {
      setNewPatientMessage("Patient first and last name are required.");
      return;
    }
    if (!newPatientDraft.dateOfLoss.trim()) {
      setNewPatientMessage("Date Of Loss is required.");
      return;
    }

    const attorneyName = cleanAttorneyLabel(newPatientDraft.attorney || "Self");
    const attorneyPhone = formatUsPhoneInput(newPatientDraft.attorneyPhone);
    if (normalizeAttorneyKey(attorneyName) !== "self" && attorneyPhone) {
      const attorneyExists = contacts.some(
        (contact) =>
          normalizeAttorneyKey(contact.category) === "attorney" &&
          normalizeAttorneyKey(contact.name) === normalizeAttorneyKey(attorneyName),
      );
      if (!attorneyExists) {
        const contactResult = addContact({
          name: attorneyName,
          category: "Attorney",
          phone: attorneyPhone,
          email: "",
          fax: "",
          address: "",
        });
        if (!contactResult.added && !contactResult.contact) {
          setNewPatientMessage(contactResult.reason);
          return;
        }
      }
    }

    const createdPatient = createPatientRecord({
      firstName,
      lastName,
      sex: newPatientDraft.sex || undefined,
      maritalStatus: newPatientDraft.maritalStatus || undefined,
      attorney: attorneyName,
      dob: newPatientDraft.dob,
      dateOfLoss: newPatientDraft.dateOfLoss,
      initialExam: newPatientDraft.initialExam,
      phone: formatUsPhoneInput(newPatientDraft.phone),
      email: newPatientDraft.email.trim(),
      address: composePatientAddress(
        newPatientDraft.addressStreet,
        newPatientDraft.addressCity,
        newPatientDraft.addressState,
        newPatientDraft.addressZip,
      ),
      caseStatus: newPatientDraft.caseStatus,
      lienStatus: newPatientDraft.lienStatus.trim(),
      priorCare: newPatientDraft.priorCare.trim(),
    });

    if (!createdPatient) {
      setNewPatientMessage("Could not create patient. Check required fields and try again.");
      return;
    }

    setShowNewPatientModal(false);
    setNewPatientMessage("");
    router.push(`/patients/${createdPatient.id}`);
  };

  const newPatientCaseNumberPreview = useMemo(
    () =>
      buildCaseNumberPreview(
        newPatientDraft.dateOfLoss,
        newPatientDraft.lastName,
        newPatientDraft.firstName,
      ),
    [newPatientDraft.dateOfLoss, newPatientDraft.firstName, newPatientDraft.lastName],
  );

  const detailRows = useMemo(
    () =>
      detailRowsTemplate.map((row) =>
        row.key === "lien"
          ? {
              ...row,
              label: lienLabel,
            }
          : row,
      ),
    [lienLabel],
  );

  const years = useMemo(
    () =>
      [
        "ALL",
        ...new Set(
          patients.map((patient) =>
            new Date(`${patient.dateOfLoss}T00:00:00`).getFullYear().toString(),
          ),
        ),
      ],
    [],
  );

  const attorneyOptions = useMemo(() => {
    const deduped = new Map<string, string>();
    patients.forEach((patient) => {
      const cleanName = cleanAttorneyLabel(patient.attorney);
      const key = normalizeAttorneyKey(cleanName);
      if (key && !deduped.has(key)) {
        deduped.set(key, cleanName);
      }
    });
    return ["ALL", ...Array.from(deduped.values())];
  }, []);

  const statusFilterOptions = useMemo(
    () => caseStatuses.map((statusConfig) => statusConfig.name),
    [caseStatuses],
  );

  const statusConfigByName = useMemo(
    () => new Map(caseStatuses.map((statusConfig) => [statusConfig.name.toLowerCase(), statusConfig] as const)),
    [caseStatuses],
  );
  const closedCaseStatuses = useMemo(
    () => caseStatuses.filter((statusConfig) => statusConfig.isCaseClosed).map((statusConfig) => statusConfig.name),
    [caseStatuses],
  );
  const followUpSettings = dashboardWorkspaceSettings.patientFollowUp;
  const enabledFollowUpCategories = useMemo(() => {
    const labels: string[] = [];
    if (followUpSettings.includeXray) {
      labels.push("X-Ray");
    }
    if (followUpSettings.includeMriCt) {
      labels.push("MRI / CT");
    }
    if (followUpSettings.includeSpecialist) {
      labels.push("Specialist");
    }
    if (followUpSettings.includeLienLop) {
      labels.push(lienLabel);
    }
    return labels;
  }, [
    followUpSettings.includeLienLop,
    followUpSettings.includeMriCt,
    followUpSettings.includeSpecialist,
    followUpSettings.includeXray,
    lienLabel,
  ]);

  const applyFilters = () => {
    setSearch(searchDraft.trim());
    setYear(yearDraft);
    setAttorney(attorneyDraft);
    setStatus(statusDraft);
  };

  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => {
      const matchesSearch =
        !search.trim() ||
        patient.fullName.toLowerCase().includes(search.toLowerCase()) ||
        patient.attorney.toLowerCase().includes(search.toLowerCase());

      const matchesYear =
        year === "ALL" ||
        new Date(`${patient.dateOfLoss}T00:00:00`).getFullYear().toString() === year;

      const matchesAttorney =
        attorney === "ALL" ||
        normalizeAttorneyKey(patient.attorney) === normalizeAttorneyKey(attorney);

      const matchesStatus = status === "ALL" || patient.caseStatus === status;

      return matchesSearch && matchesYear && matchesAttorney && matchesStatus;
    });
  }, [attorney, search, status, year]);

  const followUpItems = useMemo(() => {
    return buildFollowUpItems(filteredPatients, {
      includeXray: followUpSettings.includeXray,
      includeMriCt: followUpSettings.includeMriCt,
      includeSpecialist: followUpSettings.includeSpecialist,
      includeLienLop: followUpSettings.includeLienLop,
      xrayAppearAuto: followUpSettings.xrayAppearAuto,
      mriAppearAuto: followUpSettings.mriAppearAuto,
      mriAppearDays: followUpSettings.mriAppearDays,
      specialistAppearWhen: followUpSettings.specialistAppearWhen,
      xrayClearedBy: followUpSettings.xrayClearedBy,
      mriCtClearedBy: followUpSettings.mriCtClearedBy,
      specialistClearedBy: followUpSettings.specialistClearedBy,
      lienLopClearStatuses: followUpSettings.lienLopClearStatuses,
      followUpOverrides: followUpOverridesByPatientId,
      closedCaseStatuses,
    });
  }, [
    closedCaseStatuses,
    filteredPatients,
    followUpSettings.includeLienLop,
    followUpSettings.includeMriCt,
    followUpSettings.includeSpecialist,
    followUpSettings.includeXray,
    followUpSettings.lienLopClearStatuses,
    followUpSettings.mriAppearAuto,
    followUpSettings.mriAppearDays,
    followUpSettings.mriCtClearedBy,
    followUpSettings.specialistAppearWhen,
    followUpSettings.specialistClearedBy,
    followUpSettings.xrayAppearAuto,
    followUpSettings.xrayClearedBy,
    followUpOverridesByPatientId,
  ]);

  const followUpCounts = useMemo(
    () => ({
      total: followUpItems.length,
      xray: followUpItems.filter((entry) => entry.category === "X-Ray").length,
      mri: followUpItems.filter((entry) => entry.category === "MRI / CT").length,
      specialist: followUpItems.filter((entry) => entry.category === "Specialist").length,
      lienLop: followUpItems.filter((entry) => entry.category === "Lien / LOP").length,
    }),
    [followUpItems],
  );

  return (
    <div className="space-y-5">
      <section className="panel-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">All Patients Workspace</h3>
          <button
            className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 font-semibold text-white"
            onClick={openNewPatientModal}
            type="button"
          >
            New Patient
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              view === "list" ? "bg-[var(--brand-primary)] text-white" : "bg-[var(--bg-soft)]"
            }`}
            onClick={() => setView("list")}
            type="button"
          >
            List View
          </button>
          <button
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              view === "detail" ? "bg-[var(--brand-primary)] text-white" : "bg-[var(--bg-soft)]"
            }`}
            onClick={() => setView("detail")}
            type="button"
          >
            Detail View
          </button>
          <button
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              view === "followUp" ? "bg-[var(--brand-primary)] text-white" : "bg-[var(--bg-soft)]"
            }`}
            onClick={() => setView("followUp")}
            type="button"
          >
            Follow Up
          </button>
        </div>

        <div className="mt-4 space-y-3 rounded-xl border border-[var(--line-soft)] bg-white p-3">
          <div className="grid gap-3 md:grid-cols-[180px_1fr_170px] md:items-center">
            <label className="text-sm font-semibold text-[var(--text-muted)]">Patient Name</label>
            <input
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) => setSearchDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyFilters();
                }
              }}
              placeholder="Search patient or attorney"
              value={searchDraft}
            />
            <button
              className="rounded-xl bg-[#1f6b2c] px-4 py-2 font-semibold text-white"
              onClick={applyFilters}
              type="button"
            >
              SEARCH
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_96px]">
            <label className="grid gap-1 text-sm font-semibold text-[var(--text-muted)]">
              Year
              <select
                className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 font-normal text-[var(--text-primary)]"
                onChange={(event) => setYearDraft(event.target.value)}
                value={yearDraft}
              >
                {years.map((yearOption) => (
                  <option key={yearOption} value={yearOption}>
                    {yearOption}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm font-semibold text-[var(--text-muted)]">
              Attorney
              <select
                className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 font-normal text-[var(--text-primary)]"
                onChange={(event) => setAttorneyDraft(event.target.value)}
                value={attorneyDraft}
              >
                {attorneyOptions.map((attorneyOption) => (
                  <option key={attorneyOption} value={attorneyOption}>
                    {attorneyOption}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm font-semibold text-[var(--text-muted)]">
              Status
              <select
                className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 font-normal text-[var(--text-primary)]"
                onChange={(event) => setStatusDraft(event.target.value)}
                value={statusDraft}
              >
                <option value="ALL">ALL</option>
                {statusFilterOptions.map((statusOption) => (
                  <option key={statusOption} value={statusOption}>
                    {statusOption}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <button
                className="h-[42px] w-full rounded-xl bg-[#1f6b2c] px-4 py-2 font-semibold text-white"
                onClick={applyFilters}
                type="button"
              >
                GO
              </button>
            </div>
          </div>
        </div>
      </section>

      {view === "list" && (
        <section className="panel-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-[var(--bg-soft)] text-left text-sm">
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Attorney</th>
                  <th className="px-4 py-3">Date Of Loss</th>
                  <th className="px-4 py-3">Initial Exam</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((patient) => (
                  <tr key={patient.id} className="border-t border-[var(--line-soft)]">
                    <td className="px-4 py-3">
                      <Link
                        href={`/patients/${patient.id}`}
                        className="font-semibold text-[var(--brand-primary)] underline"
                      >
                        {patient.fullName}
                      </Link>
                      <p className="text-sm text-[var(--text-muted)]">
                        {patient.phone} • DOB {formatUsDateDisplay(patient.dob)}
                      </p>
                    </td>
                    <td className="px-4 py-3">{cleanAttorneyLabel(patient.attorney)}</td>
                    <td className="px-4 py-3">{formatUsDateDisplay(patient.dateOfLoss)}</td>
                    <td className="px-4 py-3">{formatLeadingDateDisplay(patient.matrix?.initialExam || "-")}</td>
                    <td className="px-4 py-3">{patient.priority}</td>
                    <td className="px-4 py-3">
                      <span
                        className="status-pill"
                        style={{
                          backgroundColor: withAlpha(
                            statusConfigByName.get(patient.caseStatus.toLowerCase())?.color ?? "#0d79bf",
                            0.2,
                          ),
                          color: getContrastTextColor(
                            statusConfigByName.get(patient.caseStatus.toLowerCase())?.color ?? "#0d79bf",
                          ),
                        }}
                      >
                        {patient.caseStatus}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredPatients.length === 0 && (
                  <tr className="border-t border-[var(--line-soft)]">
                    <td className="px-4 py-5 text-sm text-[var(--text-muted)]" colSpan={6}>
                      No patients match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view === "detail" && (
        <section className="panel-card overflow-hidden">
          <div className="border-b border-[var(--line-soft)] p-4">
            <h4 className="text-lg font-semibold">Detail Matrix</h4>
            <p className="text-sm text-[var(--text-muted)]">
              All filtered patients shown in one side-by-side case matrix.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1800px] border-collapse">
              <tbody>
                <tr className="bg-[var(--bg-soft)]">
                  <th className="w-[220px] border-r border-[var(--line-soft)] px-4 py-3 text-left">
                    Patient
                  </th>
                  {filteredPatients.map((patient) => (
                    <th key={`name-${patient.id}`} className="border-r border-[var(--line-soft)] px-4 py-3 text-left">
                      {patient.fullName}
                    </th>
                  ))}
                </tr>
                {detailRows.map((row) => (
                  <tr key={row.label} className="border-t border-[var(--line-soft)]">
                    <td className="border-r border-[var(--line-soft)] bg-[var(--bg-soft)] px-4 py-3 font-semibold">
                      {row.label}
                    </td>
                    {filteredPatients.map((patient) => (
                      <td key={`${row.label}-${patient.id}`} className="border-r border-[var(--line-soft)] px-4 py-3">
                        {getDetailValue(patient, row.key)}
                      </td>
                    ))}
                  </tr>
                ))}
                {filteredPatients.length === 0 && (
                  <tr className="border-t border-[var(--line-soft)]">
                    <td className="px-4 py-5 text-sm text-[var(--text-muted)]" colSpan={2}>
                      No patients match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view === "followUp" && (
        <section className="panel-card overflow-hidden">
          <div className="border-b border-[var(--line-soft)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-lg font-semibold">Follow Up Queue</h4>
                <p className="text-sm text-[var(--text-muted)]">
                  All filtered patients with pending follow-up steps. Categories shown:{" "}
                  {enabledFollowUpCategories.length ? enabledFollowUpCategories.join(", ") : "None selected"}.
                </p>
              </div>
              <div className="grid gap-1 text-right text-sm">
                <p>
                  <span className="font-semibold text-[var(--text-main)]">{followUpCounts.total}</span> Total
                </p>
                <p>
                  X-Ray <span className="font-semibold">{followUpCounts.xray}</span> • MRI/CT{" "}
                  <span className="font-semibold">{followUpCounts.mri}</span> • Specialist{" "}
                  <span className="font-semibold">{followUpCounts.specialist}</span> • {lienLabel}{" "}
                  <span className="font-semibold">{followUpCounts.lienLop}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1080px] w-full border-collapse">
              <thead>
                <tr className="bg-[var(--bg-soft)] text-left text-sm">
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Case #</th>
                  <th className="px-4 py-3">Attorney</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Follow Up</th>
                  <th className="px-4 py-3">Anchor Date</th>
                  <th className="px-4 py-3">Age</th>
                  <th className="px-4 py-3">Case Status</th>
                </tr>
              </thead>
              <tbody>
                {followUpItems.map((item) => (
                  <tr key={item.id} className="border-t border-[var(--line-soft)]">
                    <td className="px-4 py-3">
                      <Link href={`/patients/${item.patientId}`} className="font-semibold text-[var(--brand-primary)] underline">
                        {item.patientName}
                      </Link>
                      {item.note && <p className="text-xs text-[var(--text-muted)]">{item.note}</p>}
                    </td>
                    <td className="px-4 py-3 font-semibold">{item.caseNumber || "-"}</td>
                    <td className="px-4 py-3">{item.attorney || "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getFollowUpBadgeClass(item.category)}`}>
                        {item.category === "Lien / LOP" ? lienLabel : item.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">{item.stage}</td>
                    <td className="px-4 py-3">{item.anchorDate ? formatUsDateDisplay(item.anchorDate) : "-"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${getAgePillClass(
                          item.daysFromAnchor,
                          followUpSettings.staleDaysThreshold,
                        )}`}
                      >
                        {item.daysFromAnchor === null
                          ? "No date"
                          : item.daysFromAnchor < 0
                            ? `In ${Math.abs(item.daysFromAnchor)}d`
                            : item.daysFromAnchor >= followUpSettings.staleDaysThreshold
                              ? `Stale ${item.daysFromAnchor}d`
                              : `${item.daysFromAnchor}d`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="status-pill"
                        style={{
                          backgroundColor: withAlpha(
                            statusConfigByName.get(item.caseStatus.toLowerCase())?.color ?? "#0d79bf",
                            0.2,
                          ),
                          color: getContrastTextColor(
                            statusConfigByName.get(item.caseStatus.toLowerCase())?.color ?? "#0d79bf",
                          ),
                        }}
                      >
                        {item.caseStatus}
                      </span>
                    </td>
                  </tr>
                ))}
                {followUpItems.length === 0 && (
                  <tr className="border-t border-[var(--line-soft)]">
                    <td className="px-4 py-5 text-sm text-[var(--text-muted)]" colSpan={8}>
                      No follow-up items in the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {showNewPatientModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 px-4 py-8">
          <div className="panel-card mx-auto w-full max-w-6xl p-4 md:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xl font-semibold">New Patient</h3>
                  <p className="text-sm text-[var(--text-muted)]">
                    Enter core patient details to create a new case file.
                  </p>
                </div>
                <button
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-1.5 text-sm font-semibold"
                  onClick={closeNewPatientModal}
                  type="button"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Patient Last Name *</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    onChange={(event) =>
                      setNewPatientDraft((current) => ({
                        ...current,
                        lastName: event.target.value,
                      }))
                    }
                    value={newPatientDraft.lastName}
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Patient First Name *</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    onChange={(event) =>
                      setNewPatientDraft((current) => ({
                        ...current,
                        firstName: event.target.value,
                      }))
                    }
                    value={newPatientDraft.firstName}
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Sex</span>
                  <select
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    onChange={(event) =>
                      setNewPatientDraft((current) => ({
                        ...current,
                        sex: event.target.value as NewPatientDraft["sex"],
                      }))
                    }
                    value={newPatientDraft.sex}
                  >
                    <option value="">—</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Marital Status</span>
                  <select
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    onChange={(event) =>
                      setNewPatientDraft((current) => ({
                        ...current,
                        maritalStatus: event.target.value as NewPatientDraft["maritalStatus"],
                      }))
                    }
                    value={newPatientDraft.maritalStatus}
                  >
                    <option value="">—</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Divorced">Divorced</option>
                    <option value="Widowed">Widowed</option>
                  </select>
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Attorney</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    list="new-patient-attorney-options"
                    onChange={(event) => {
                      const value = event.target.value;
                      const matchedAttorney = attorneyContacts.find(
                        (contact) => normalizeAttorneyKey(contact.name) === normalizeAttorneyKey(value),
                      );
                      setNewPatientDraft((current) => ({
                        ...current,
                        attorney: value,
                        attorneyPhone: matchedAttorney
                          ? formatUsPhoneInput(matchedAttorney.phone)
                          : value.trim()
                            ? current.attorneyPhone
                            : "",
                      }));
                    }}
                    placeholder="Self"
                    value={newPatientDraft.attorney}
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Attorney Phone</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    inputMode="numeric"
                    maxLength={12}
                    onChange={(event) =>
                      setNewPatientDraft((current) => ({
                        ...current,
                        attorneyPhone: formatUsPhoneInput(event.target.value),
                      }))
                    }
                    placeholder="818-555-0123"
                    value={newPatientDraft.attorneyPhone}
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Patient DOB</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(event) =>
                      setNewPatientDraft((current) => ({
                        ...current,
                        dob: formatUsDateInput(event.target.value),
                      }))
                    }
                    placeholder="MM/DD/YYYY"
                    value={newPatientDraft.dob}
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Date Of Loss *</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(event) =>
                      setNewPatientDraft((current) => ({
                        ...current,
                        dateOfLoss: formatUsDateInput(event.target.value),
                      }))
                    }
                    placeholder="MM/DD/YYYY"
                    value={newPatientDraft.dateOfLoss}
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Initial Exam</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    inputMode="numeric"
                    maxLength={10}
                    onChange={(event) =>
                      setNewPatientDraft((current) => ({
                        ...current,
                        initialExam: formatUsDateInput(event.target.value),
                      }))
                    }
                    placeholder="MM/DD/YYYY"
                    value={newPatientDraft.initialExam}
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Case #</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-[rgba(242,247,252,0.65)] px-3 py-2 font-semibold tracking-[0.08em] text-[var(--text-strong)]"
                    placeholder="MMDDYYLASTFIRST"
                    readOnly
                    value={newPatientCaseNumberPreview}
                  />
                </label>

                <label className="grid gap-1 md:col-span-1 xl:col-span-2">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Patient Phone</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    inputMode="numeric"
                    maxLength={12}
                    onChange={(event) =>
                      setNewPatientDraft((current) => ({
                        ...current,
                        phone: formatUsPhoneInput(event.target.value),
                      }))
                    }
                    placeholder="818-555-0123"
                    value={newPatientDraft.phone}
                  />
                </label>

                <label className="grid gap-1 md:col-span-1 xl:col-span-2">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Patient Email</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    onChange={(event) =>
                      setNewPatientDraft((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    placeholder="patient@email.com"
                    value={newPatientDraft.email}
                  />
                </label>

                <div className="grid gap-3 md:col-span-2 xl:col-span-4 xl:grid-cols-[2fr_1.2fr_0.8fr_0.9fr]">
                  <label className="grid gap-1">
                    <span className="text-sm font-semibold text-[var(--text-muted)]">Street</span>
                    <input
                      className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                      onChange={(event) =>
                        setNewPatientDraft((current) => ({
                          ...current,
                          addressStreet: event.target.value,
                        }))
                      }
                      placeholder="Street address"
                      value={newPatientDraft.addressStreet}
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-sm font-semibold text-[var(--text-muted)]">City</span>
                    <input
                      className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                      onChange={(event) =>
                        setNewPatientDraft((current) => ({
                          ...current,
                          addressCity: event.target.value,
                        }))
                      }
                      placeholder="City"
                      value={newPatientDraft.addressCity}
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-sm font-semibold text-[var(--text-muted)]">State</span>
                    <input
                      className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 uppercase"
                      maxLength={2}
                      onChange={(event) =>
                        setNewPatientDraft((current) => ({
                          ...current,
                          addressState: event.target.value.toUpperCase().replace(/[^A-Z]/g, ""),
                        }))
                      }
                      placeholder="CA"
                      value={newPatientDraft.addressState}
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-sm font-semibold text-[var(--text-muted)]">ZIP</span>
                    <input
                      className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                      inputMode="numeric"
                      maxLength={10}
                      onChange={(event) =>
                        setNewPatientDraft((current) => ({
                          ...current,
                          addressZip: event.target.value.replace(/[^\d-]/g, ""),
                        }))
                      }
                      placeholder="91205"
                      value={newPatientDraft.addressZip}
                    />
                  </label>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">{lienLabel}</span>
                  <select
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    onChange={(event) =>
                      setNewPatientDraft((current) => ({
                        ...current,
                        lienStatus: event.target.value,
                      }))
                    }
                    value={newPatientDraft.lienStatus}
                  >
                    {lienOptions.map((option) => (
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
                    onChange={(event) =>
                      setNewPatientDraft((current) => ({
                        ...current,
                        priorCare: event.target.value,
                      }))
                    }
                    placeholder="Any prior treatment details"
                    value={newPatientDraft.priorCare}
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">Status</span>
                  <select
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    onChange={(event) =>
                      setNewPatientDraft((current) => ({
                        ...current,
                        caseStatus: event.target.value as PatientRecord["caseStatus"],
                      }))
                    }
                    value={newPatientDraft.caseStatus}
                  >
                    {caseStatuses.map((statusConfig) => (
                      <option key={statusConfig.name} value={statusConfig.name}>
                        {statusConfig.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {newPatientMessage && (
                <p className="mt-3 text-sm font-semibold text-[#b43b34]">{newPatientMessage}</p>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <button
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
                  onClick={closeNewPatientModal}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 font-semibold text-white"
                  onClick={createNewPatient}
                  type="button"
                >
                  Create Patient
                </button>
              </div>

              <datalist id="new-patient-attorney-options">
                {attorneyContacts.map((contact) => (
                  <option key={contact.id} value={contact.name} />
                ))}
              </datalist>
            </div>
        </div>
      )}
    </div>
  );
}
