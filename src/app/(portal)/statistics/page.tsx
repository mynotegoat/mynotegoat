"use client";

import { useMemo, useState } from "react";
import { useCaseStatuses } from "@/hooks/use-case-statuses";
import {
  caseTimelineMetrics,
  charges,
  imagingEvents,
  patients,
} from "@/lib/mock-data";

const monthOrder = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAYS_PER_MONTH = 30.436875;

function monthNameFromDate(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  return date.toLocaleString("en-US", { month: "long" });
}

function normalizeAttorneyKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanAttorneyLabel(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function extractSpecialistLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") {
    return "";
  }
  const withoutLeadingDate = trimmed.replace(/^\d{1,2}\/\d{1,2}\/\d{2,4}\s*/, "").trim();
  return withoutLeadingDate || trimmed;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatMonthsFromDays(value: number) {
  if (!value) {
    return "N/A";
  }
  const months = value / DAYS_PER_MONTH;
  return `${months.toFixed(1)} months`;
}

function formatAverageCaseCount(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export default function StatisticsPage() {
  const { caseStatuses } = useCaseStatuses();
  const [searchDraft, setSearchDraft] = useState("");
  const [yearDraft, setYearDraft] = useState("ALL");
  const [attorneyDraft, setAttorneyDraft] = useState("ALL");
  const [statusDraft, setStatusDraft] = useState("ALL");
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("ALL");
  const [attorney, setAttorney] = useState("ALL");
  const [status, setStatus] = useState("ALL");

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

  const filteredNames = useMemo(
    () => new Set(filteredPatients.map((patient) => patient.fullName)),
    [filteredPatients],
  );
  const filteredPatientIds = useMemo(
    () => new Set(filteredPatients.map((patient) => patient.id)),
    [filteredPatients],
  );
  const filteredPatientByName = useMemo(
    () => new Map(filteredPatients.map((patient) => [patient.fullName, patient] as const)),
    [filteredPatients],
  );

  const filteredCharges = useMemo(
    () => charges.filter((charge) => filteredNames.has(charge.patientName)),
    [filteredNames],
  );

  const filteredImagingEvents = useMemo(
    () => imagingEvents.filter((event) => filteredPatientIds.has(event.patientId)),
    [filteredPatientIds],
  );

  const filteredTimelineMetrics = useMemo(
    () => caseTimelineMetrics.filter((record) => filteredPatientIds.has(record.patientId)),
    [filteredPatientIds],
  );

  const billedTotal = filteredCharges.reduce((sum, entry) => sum + entry.billed, 0);
  const paidTotal = filteredCharges.reduce((sum, entry) => sum + entry.paid, 0);

  const paidCaseCharges = useMemo(
    () =>
      filteredCharges.filter((charge) => {
        const patient = filteredPatientByName.get(charge.patientName);
        return charge.paid > 0 || patient?.caseStatus === "Paid";
      }),
    [filteredCharges, filteredPatientByName],
  );

  const billedTotalPaidCases = paidCaseCharges.reduce((sum, entry) => sum + entry.billed, 0);
  const paidTotalPaidCases = paidCaseCharges.reduce((sum, entry) => sum + entry.paid, 0);
  const paidRate = billedTotalPaidCases === 0 ? 0 : (paidTotalPaidCases / billedTotalPaidCases) * 100;
  const avgBilled = filteredPatients.length ? billedTotal / filteredPatients.length : 0;
  const avgPaid = filteredPatients.length ? paidTotal / filteredPatients.length : 0;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    caseStatuses.forEach((statusConfig) => {
      counts[statusConfig.name] = 0;
    });

    filteredPatients.forEach((patient) => {
      counts[patient.caseStatus] = (counts[patient.caseStatus] ?? 0) + 1;
    });
    return counts;
  }, [caseStatuses, filteredPatients]);

  const monthCounts = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(
      monthOrder.map((monthName) => [monthName, 0]),
    ) as Record<string, number>;

    filteredPatients.forEach((patient) => {
      const month = monthNameFromDate(patient.dateOfLoss);
      counts[month] += 1;
    });

    return monthOrder.map((monthName) => ({
      month: monthName,
      count: counts[monthName],
    }));
  }, [filteredPatients]);

  const totalCasesAcrossMonths = monthCounts.reduce((sum, entry) => sum + entry.count, 0);
  const monthsWithCases = monthCounts.filter((entry) => entry.count > 0).length;
  const averageCasesPerMonth = monthsWithCases > 0 ? totalCasesAcrossMonths / monthsWithCases : 0;

  const timelineAverages = useMemo(() => {
    const initialToDischargeValues = filteredTimelineMetrics
      .map((metric) => metric.initialToDischargeDays)
      .filter((value): value is number => typeof value === "number");
    const dischargeToRbValues = filteredTimelineMetrics
      .map((metric) => metric.dischargeToRbDays)
      .filter((value): value is number => typeof value === "number");
    const rbToPaidValues = filteredTimelineMetrics
      .map((metric) => metric.rbToPaidDays)
      .filter((value): value is number => typeof value === "number");

    return {
      initialToDischarge: average(initialToDischargeValues),
      dischargeToRb: average(dischargeToRbValues),
      rbToPaid: average(rbToPaidValues),
    };
  }, [filteredTimelineMetrics]);

  const imagingFacilityStats = useMemo(() => {
    const grouped: Record<
      string,
      { facility: string; xray: number; mri: number; total: number; casePatientIds: Set<string> }
    > = {};

    filteredImagingEvents.forEach((event) => {
      if (!grouped[event.facility]) {
        grouped[event.facility] = {
          facility: event.facility,
          xray: 0,
          mri: 0,
          total: 0,
          casePatientIds: new Set<string>(),
        };
      }

      grouped[event.facility].casePatientIds.add(event.patientId);
      const referrals = Math.max(1, event.quantity ?? 1);
      if (event.type === "X-Ray") {
        grouped[event.facility].xray += referrals;
      } else {
        grouped[event.facility].mri += referrals;
      }
      grouped[event.facility].total += referrals;
    });

    return Object.values(grouped)
      .map((row) => ({
        facility: row.facility,
        cases: row.casePatientIds.size,
        xray: row.xray,
        mri: row.mri,
        total: row.total,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredImagingEvents]);

  const specialistReferralStats = useMemo(() => {
    const grouped: Record<string, { specialist: string; casePatientIds: Set<string> }> = {};

    filteredPatients.forEach((patient) => {
      const specialist = extractSpecialistLabel(patient.matrix?.specialistSent ?? "");
      if (!specialist) {
        return;
      }

      const key = specialist.toLowerCase();
      if (!grouped[key]) {
        grouped[key] = {
          specialist,
          casePatientIds: new Set<string>(),
        };
      }
      grouped[key].casePatientIds.add(patient.id);
    });

    return Object.values(grouped)
      .map((row) => ({
        specialist: row.specialist,
        cases: row.casePatientIds.size,
      }))
      .sort((a, b) => b.cases - a.cases);
  }, [filteredPatients]);

  const attorneyStats = useMemo(() => {
    const chargeByPatient = new Map<string, { billed: number; paid: number }>();
    filteredCharges.forEach((charge) => {
      const current = chargeByPatient.get(charge.patientName) ?? { billed: 0, paid: 0 };
      current.billed += charge.billed;
      current.paid += charge.paid;
      chargeByPatient.set(charge.patientName, current);
    });

    const timelineByPatientId = new Map(
      filteredTimelineMetrics.map((metric) => [metric.patientId, metric] as const),
    );

    const grouped: Record<
      string,
      {
        attorney: string;
        received: number;
        active: number;
        discharged: number;
        readyToSubmit: number;
        submitted: number;
        dropped: number;
        paid: number;
        billed: number;
        collected: number;
        timeToRbValues: number[];
        timeToPaidValues: number[];
      }
    > = {};

    filteredPatients.forEach((patient) => {
      const attorneyKey = normalizeAttorneyKey(patient.attorney);
      if (!grouped[attorneyKey]) {
        grouped[attorneyKey] = {
          attorney: cleanAttorneyLabel(patient.attorney),
          received: 0,
          active: 0,
          discharged: 0,
          readyToSubmit: 0,
          submitted: 0,
          dropped: 0,
          paid: 0,
          billed: 0,
          collected: 0,
          timeToRbValues: [],
          timeToPaidValues: [],
        };
      }

      const row = grouped[attorneyKey];
      row.received += 1;
      row.active += patient.caseStatus === "Active" ? 1 : 0;
      row.discharged += patient.caseStatus === "Discharged" ? 1 : 0;
      row.readyToSubmit += patient.caseStatus === "Ready To Submit" ? 1 : 0;
      row.submitted += patient.caseStatus === "Submitted" ? 1 : 0;
      row.dropped += patient.caseStatus === "Dropped" ? 1 : 0;
      row.paid += patient.caseStatus === "Paid" ? 1 : 0;

      const chargeTotals = chargeByPatient.get(patient.fullName);
      if (chargeTotals) {
        row.billed += chargeTotals.billed;
        row.collected += chargeTotals.paid;
      }

      const timeline = timelineByPatientId.get(patient.id);
      if (timeline?.dischargeToRbDays) {
        row.timeToRbValues.push(timeline.dischargeToRbDays);
      }
      if (timeline?.rbToPaidDays) {
        row.timeToPaidValues.push(timeline.rbToPaidDays);
      }
    });

    return Object.values(grouped)
      .map((row) => {
        const avgTimeToRb = average(row.timeToRbValues);
        const avgTimeToPaid = average(row.timeToPaidValues);
        const percentPaid = row.billed ? (row.collected / row.billed) * 100 : 0;
        return {
          ...row,
          avgTimeToRb,
          avgTimeToPaid,
          percentPaid,
        };
      })
      .sort((a, b) => b.received - a.received);
  }, [filteredCharges, filteredPatients, filteredTimelineMetrics]);

  return (
    <div className="space-y-5">
      <section className="panel-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">Statistics Workspace</h3>
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

      <div className="space-y-5">
        <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <article className="panel-card p-4">
            <h4 className="text-lg font-semibold">Billing Snapshot</h4>
            <div className="mt-4 space-y-2 text-sm">
              <p className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Billed</span>
                <span className="font-bold">{formatMoney(billedTotal)}</span>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Collected</span>
                <span className="font-bold">{formatMoney(paidTotal)}</span>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">% Paid (Paid Cases)</span>
                <span className="font-bold">{paidRate.toFixed(1)}%</span>
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Uses only cases with payments or Paid status for percentage.
              </p>
              <div className="my-2 border-t border-[var(--line-soft)]" />
              <p className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Avg/Billed</span>
                <span className="font-bold">{formatMoney(avgBilled)}</span>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Avg/Paid</span>
                <span className="font-bold">{formatMoney(avgPaid)}</span>
              </p>
            </div>
          </article>

          <article className="panel-card p-4">
            <h4 className="text-lg font-semibold">Total Reports</h4>
            <p className="mt-2 text-3xl font-bold">{filteredPatients.length}</p>
            <div className="mt-3 space-y-1">
              {caseStatuses.map((statusConfig) => (
                <p key={statusConfig.name} className="flex items-center gap-2 text-sm">
                  <span
                    className="inline-block h-3 w-3 rounded-full border border-[var(--line-soft)]"
                    style={{ backgroundColor: statusConfig.color }}
                  />
                  <span>{statusConfig.name.toUpperCase()}</span>
                  <span className="font-semibold">{statusCounts[statusConfig.name] ?? 0}</span>
                </p>
              ))}
            </div>
          </article>

          <article className="panel-card p-4">
            <h4 className="text-lg font-semibold">Cycle Time Averages</h4>
            <div className="mt-4 space-y-2 text-sm">
              <p className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Avg. Initial To Discharge</span>
                <span className="font-semibold">{formatMonthsFromDays(timelineAverages.initialToDischarge)}</span>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Avg. Discharge To R&B</span>
                <span className="font-semibold">{formatMonthsFromDays(timelineAverages.dischargeToRb)}</span>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Avg. R&B To Paid</span>
                <span className="font-semibold">{formatMonthsFromDays(timelineAverages.rbToPaid)}</span>
              </p>
            </div>
          </article>

          <article className="panel-card p-4">
            <h4 className="text-lg font-semibold">Cases By Month</h4>
            <div className="mt-2 space-y-1 text-sm">
              {monthCounts.map((entry) => (
                <div key={entry.month} className="flex items-center justify-between">
                  <span>{entry.month}</span>
                  <span className="font-semibold">{entry.count}</span>
                </div>
              ))}
              <div className="my-2 border-t border-[var(--line-soft)]" />
              <div className="flex items-center justify-between">
                <span className="font-semibold">Average / Month</span>
                <span className="font-bold">{formatAverageCaseCount(averageCasesPerMonth)}</span>
              </div>
            </div>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-[2fr_1fr]">
          <article className="panel-card overflow-hidden">
            <div className="border-b border-[var(--line-soft)] p-4">
              <h4 className="text-lg font-semibold">Imaging Referral Totals</h4>
              <p className="text-sm text-[var(--text-muted)]">
                Counts use referral quantity (for example, one patient can have multiple X-rays).
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="bg-[var(--bg-soft)] text-left text-sm">
                    <th className="px-4 py-3">Facility</th>
                    <th className="px-4 py-3">Cases</th>
                    <th className="px-4 py-3">X-Ray Referrals</th>
                    <th className="px-4 py-3">MRI Referrals</th>
                    <th className="px-4 py-3">Total Referrals</th>
                  </tr>
                </thead>
                <tbody>
                  {imagingFacilityStats.map((row) => (
                    <tr key={row.facility} className="border-t border-[var(--line-soft)]">
                      <td className="px-4 py-3 font-semibold">{row.facility}</td>
                      <td className="px-4 py-3">{row.cases}</td>
                      <td className="px-4 py-3">{row.xray}</td>
                      <td className="px-4 py-3">{row.mri}</td>
                      <td className="px-4 py-3">{row.total}</td>
                    </tr>
                  ))}
                  {imagingFacilityStats.length === 0 && (
                    <tr className="border-t border-[var(--line-soft)]">
                      <td className="px-4 py-5 text-sm text-[var(--text-muted)]" colSpan={5}>
                        No imaging rows for selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel-card overflow-hidden">
            <div className="border-b border-[var(--line-soft)] p-4">
              <h4 className="text-lg font-semibold">Specialist Referral Totals</h4>
              <p className="text-sm text-[var(--text-muted)]">Case counts only.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="bg-[var(--bg-soft)] text-left text-sm">
                    <th className="px-4 py-3">Specialist</th>
                    <th className="px-4 py-3">Cases</th>
                  </tr>
                </thead>
                <tbody>
                  {specialistReferralStats.map((row) => (
                    <tr key={row.specialist} className="border-t border-[var(--line-soft)]">
                      <td className="px-4 py-3 font-semibold">{row.specialist}</td>
                      <td className="px-4 py-3">{row.cases}</td>
                    </tr>
                  ))}
                  {specialistReferralStats.length === 0 && (
                    <tr className="border-t border-[var(--line-soft)]">
                      <td className="px-4 py-5 text-sm text-[var(--text-muted)]" colSpan={2}>
                        No specialist rows for selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <section className="panel-card overflow-hidden">
          <div className="border-b border-[var(--line-soft)] p-4">
            <h4 className="text-lg font-semibold">Attorney Performance</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-[var(--bg-soft)] text-left text-sm">
                  <th className="px-4 py-3">Attorney</th>
                  <th className="px-4 py-3">Received</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3">Discharged</th>
                  <th className="px-4 py-3">Ready To Submit</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Dropped</th>
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Avg. Time To R&amp;B</th>
                  <th className="px-4 py-3">Avg. Time To Paid</th>
                  <th className="px-4 py-3">% Paid</th>
                </tr>
              </thead>
              <tbody>
                {attorneyStats.map((row) => (
                  <tr key={row.attorney} className="border-t border-[var(--line-soft)]">
                    <td className="px-4 py-3 font-semibold">{row.attorney}</td>
                    <td className="px-4 py-3">{row.received}</td>
                    <td className="px-4 py-3">{row.active}</td>
                    <td className="px-4 py-3">{row.discharged}</td>
                    <td className="px-4 py-3">{row.readyToSubmit}</td>
                    <td className="px-4 py-3">{row.submitted}</td>
                    <td className="px-4 py-3">{row.dropped}</td>
                    <td className="px-4 py-3">{row.paid}</td>
                    <td className="px-4 py-3">{formatMonthsFromDays(row.avgTimeToRb)}</td>
                    <td className="px-4 py-3">{formatMonthsFromDays(row.avgTimeToPaid)}</td>
                    <td className="px-4 py-3">{row.percentPaid.toFixed(2)}%</td>
                  </tr>
                ))}
                {attorneyStats.length === 0 && (
                  <tr className="border-t border-[var(--line-soft)]">
                    <td className="px-4 py-5 text-sm text-[var(--text-muted)]" colSpan={11}>
                      No attorney stats for selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
