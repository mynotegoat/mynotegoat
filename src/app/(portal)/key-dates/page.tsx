"use client";

import { useMemo, useState } from "react";
import { useKeyDates } from "@/hooks/use-key-dates";
import { useScheduleAppointments } from "@/hooks/use-schedule-appointments";
import {
  findKeyDatesForDate,
  formatKeyDateRange,
  formatUsDateFromIso,
  type KeyDateOfficeStatus,
  type KeyDateRecord,
} from "@/lib/key-dates";
import { formatTimeLabel, type ScheduleAppointmentRecord } from "@/lib/schedule-appointments";

type KeyDateDraft = {
  startDate: string;
  endDate: string;
  officeStatus: KeyDateOfficeStatus;
  reason: string;
  isRange: boolean;
};

type ConflictRow = {
  appointment: ScheduleAppointmentRecord;
  matches: KeyDateRecord[];
  hasClosedDate: boolean;
};

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

function toIsoFromUsDate(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return null;
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(year) ||
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
  const mm = `${month}`.padStart(2, "0");
  const dd = `${day}`.padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function createDraft(): KeyDateDraft {
  return {
    startDate: "",
    endDate: "",
    officeStatus: "Closed",
    reason: "",
    isRange: false,
  };
}

function compareConflictRows(left: ConflictRow, right: ConflictRow) {
  const leftKey = `${left.appointment.date} ${left.appointment.startTime}`;
  const rightKey = `${right.appointment.date} ${right.appointment.startTime}`;
  return leftKey.localeCompare(rightKey);
}

export default function KeyDatesPage() {
  const { keyDates, addKeyDate, updateKeyDate, removeKeyDate } = useKeyDates();
  const { scheduleAppointments } = useScheduleAppointments();

  const [draft, setDraft] = useState<KeyDateDraft>(() => createDraft());
  const [formError, setFormError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const warningRows = useMemo(() => {
    const rows: ConflictRow[] = [];
    scheduleAppointments.forEach((appointment) => {
      const matches = findKeyDatesForDate(keyDates, appointment.date);
      if (!matches.length) {
        return;
      }
      rows.push({
        appointment,
        matches,
        hasClosedDate: matches.some((entry) => entry.officeStatus === "Closed"),
      });
    });
    return rows.sort(compareConflictRows);
  }, [keyDates, scheduleAppointments]);

  const closedWarnings = warningRows.filter((row) => row.hasClosedDate);
  const coveredWarnings = warningRows.filter((row) => !row.hasClosedDate);

  const startEditing = (row: KeyDateRecord) => {
    setEditingId(row.id);
    setFormError("");
    setDraft({
      startDate: formatUsDateFromIso(row.startDate),
      endDate: formatUsDateFromIso(row.endDate),
      officeStatus: row.officeStatus,
      reason: row.reason,
      isRange: row.startDate !== row.endDate,
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setFormError("");
    setDraft(createDraft());
  };

  const submitForm = () => {
    const startDate = toIsoFromUsDate(draft.startDate);
    if (!startDate) {
      setFormError("Enter Date as MM/DD/YYYY.");
      return;
    }

    const endInput = draft.isRange ? draft.endDate : draft.startDate;
    const endDate = toIsoFromUsDate(endInput);
    if (!endDate) {
      setFormError("Enter Date Range as MM/DD/YYYY.");
      return;
    }

    const payload = {
      startDate,
      endDate,
      officeStatus: draft.officeStatus,
      reason: draft.reason,
    } as const;

    if (!editingId) {
      const result = addKeyDate(payload);
      if (!result.added) {
        setFormError(result.reason ?? "Could not add key date.");
        return;
      }
      resetForm();
      return;
    }

    const result = updateKeyDate(editingId, payload);
    if (!result.updated) {
      setFormError(result.reason ?? "Could not update key date.");
      return;
    }
    resetForm();
  };

  return (
    <div className="space-y-5">
      <section className="panel-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold">Key Dates</h3>
            <p className="text-sm text-[var(--text-muted)]">
              Track office closure/coverage dates and prevent accidental scheduling on closed days.
            </p>
          </div>
          <div className="grid gap-2 text-right text-sm">
            <p>
              <span className="font-semibold text-[#b43b34]">{closedWarnings.length}</span> Closed-date conflicts
            </p>
            <p>
              <span className="font-semibold text-[#0d79bf]">{coveredWarnings.length}</span> Covered-date appointments
            </p>
          </div>
        </div>
      </section>

      <form className="panel-card p-4" onSubmit={(e) => { e.preventDefault(); submitForm(); }}>
        <h4 className="text-lg font-semibold">{editingId ? "Edit Key Date" : "Add Key Date"}</h4>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="grid gap-1">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Date *</span>
            <input
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              inputMode="numeric"
              maxLength={10}
              onChange={(event) =>
                setDraft((current) => ({ ...current, startDate: formatUsDateInput(event.target.value) }))
              }
              placeholder="MM/DD/YYYY"
              type="text"
              value={draft.startDate}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Date Range</span>
            <input
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              disabled={!draft.isRange}
              inputMode="numeric"
              maxLength={10}
              onChange={(event) =>
                setDraft((current) => ({ ...current, endDate: formatUsDateInput(event.target.value) }))
              }
              placeholder="MM/DD/YYYY"
              type="text"
              value={draft.isRange ? draft.endDate : draft.startDate}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Office Status *</span>
            <select
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) =>
                setDraft((current) => ({ ...current, officeStatus: event.target.value as KeyDateOfficeStatus }))
              }
              value={draft.officeStatus}
            >
              <option value="Closed">Closed</option>
              <option value="Covered">Covered</option>
            </select>
          </label>

          <label className="grid gap-1 xl:col-span-2">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Reason</span>
            <input
              className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))}
              placeholder="Vacation, holiday, conference, etc."
              value={draft.reason}
            />
          </label>
        </div>

        <label className="mt-3 inline-flex items-center gap-2 text-sm font-semibold">
          <input
            checked={draft.isRange}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                isRange: event.target.checked,
                endDate: event.target.checked ? current.endDate || current.startDate : current.startDate,
              }))
            }
            type="checkbox"
          />
          Use date range
        </label>

        {formError && <p className="mt-3 text-sm font-semibold text-[#b43b34]">{formError}</p>}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {editingId && (
            <button
              className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
              onClick={resetForm}
              type="button"
            >
              Cancel Edit
            </button>
          )}
          <button
            className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 font-semibold text-white"
            type="submit"
          >
            {editingId ? "Save Key Date" : "Add Key Date"}
          </button>
        </div>
      </form>

      <section className="panel-card overflow-hidden">
        <div className="border-b border-[var(--line-soft)] px-4 py-3">
          <h4 className="text-lg font-semibold">Configured Key Dates</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[700px] w-full text-sm">
            <thead className="bg-[var(--bg-soft)] text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Reason</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keyDates.map((row) => (
                <tr key={row.id} className="border-t border-[var(--line-soft)]">
                  <td className="px-4 py-3">{formatKeyDateRange(row)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        row.officeStatus === "Closed"
                          ? "bg-[rgba(201,66,58,0.15)] text-[#b43b34]"
                          : "bg-[rgba(13,121,191,0.12)] text-[#0d79bf]"
                      }`}
                    >
                      {row.officeStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">{row.reason || "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        className="rounded-lg border border-[var(--line-soft)] px-3 py-1 font-semibold"
                        onClick={() => startEditing(row)}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="rounded-lg border border-[rgba(201,66,58,0.4)] bg-[rgba(201,66,58,0.08)] px-3 py-1 font-semibold text-[#b43b34]"
                        onClick={() => { if (window.confirm(`Delete key date "${row.reason}"?`)) removeKeyDate(row.id); }}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {keyDates.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-[var(--text-muted)]" colSpan={4}>
                    No key dates yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel-card overflow-hidden">
        <div className="border-b border-[var(--line-soft)] px-4 py-3">
          <h4 className="text-lg font-semibold">Warning List: Appointments On Key Dates</h4>
          <p className="text-sm text-[var(--text-muted)]">
            Use this to catch migration mistakes where appointments landed on office key dates.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[960px] w-full text-sm">
            <thead className="bg-[var(--bg-soft)] text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold">Patient</th>
                <th className="px-4 py-3 font-semibold">Appointment</th>
                <th className="px-4 py-3 font-semibold">Key Date Status</th>
                <th className="px-4 py-3 font-semibold">Key Date Reason</th>
              </tr>
            </thead>
            <tbody>
              {warningRows.map((row) => {
                const keyStatusLabel = row.matches.map((entry) => entry.officeStatus).join(", ");
                const reasonLabel = row.matches
                  .map((entry) =>
                    `${entry.reason || "No reason"} (${formatKeyDateRange({
                      startDate: entry.startDate,
                      endDate: entry.endDate,
                    })})`,
                  )
                  .join("; ");
                return (
                  <tr key={`warning-${row.appointment.id}`} className="border-t border-[var(--line-soft)]">
                    <td className="px-4 py-3">{formatUsDateFromIso(row.appointment.date)}</td>
                    <td className="px-4 py-3">{formatTimeLabel(row.appointment.startTime)}</td>
                    <td className="px-4 py-3 font-semibold">{row.appointment.patientName}</td>
                    <td className="px-4 py-3">{row.appointment.appointmentType}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          row.hasClosedDate
                            ? "bg-[rgba(201,66,58,0.15)] text-[#b43b34]"
                            : "bg-[rgba(13,121,191,0.12)] text-[#0d79bf]"
                        }`}
                      >
                        {keyStatusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">{reasonLabel}</td>
                  </tr>
                );
              })}
              {warningRows.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-[var(--text-muted)]" colSpan={6}>
                    No appointments currently fall on key dates.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
