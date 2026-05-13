"use client";

import { useMemo, useState } from "react";
import { useCashPayments } from "@/hooks/use-cash-payments";
import { useEncounterNotes } from "@/hooks/use-encounter-notes";
import {
  cashPaymentTypeOptions,
  createCashPayment,
  formatCashAmount,
  sumCashDiscounts,
  sumCashPayments,
} from "@/lib/cash-payments";
import type { CashPaymentEntry } from "@/lib/mock-data";
import { UsDateInput } from "@/components/us-date-input";

type Props = {
  patientId: string;
};


function getTodayUsDate(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const y = String(now.getFullYear());
  return `${m}/${d}/${y}`;
}

export function CashPaymentsSection({ patientId }: Props) {
  const { paymentsByPatient, updatePatientPayments } = useCashPayments();
  // Pull encounter notes so we can auto-show "Owed" per payment row
  // (sum of unitPrice × units on that date's encounter charges) and
  // auto-fill the Amount when the office is adding a new row.
  const { encounters } = useEncounterNotes();
  const entries = paymentsByPatient[patientId] ?? [];

  // Map: US-date string → owed dollars, scoped to THIS patient.
  // Memoized so the table doesn't recompute on every keystroke.
  const owedByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const enc of encounters) {
      if (enc.patientId !== patientId) continue;
      const date = enc.encounterDate;
      if (!date) continue;
      const dayTotal = enc.charges.reduce(
        (sum, c) => sum + (Number(c.unitPrice) || 0) * (Number(c.units) || 0),
        0,
      );
      map.set(date, (map.get(date) ?? 0) + dayTotal);
    }
    return map;
  }, [encounters, patientId]);

  const draftOwed = (date: string) => owedByDate.get(date) ?? 0;
  const [draft, setDraft] = useState<{
    date: string;
    amount: string;
    discount: string;
    paymentType: CashPaymentEntry["paymentType"];
    note: string;
  }>(() => ({
    date: getTodayUsDate(),
    amount: "",
    discount: "",
    paymentType: "Cash",
    note: "",
  }));
  const [error, setError] = useState("");

  const total = sumCashPayments(entries);
  const totalDiscount = sumCashDiscounts(entries);

  const handleAdd = () => {
    setError("");
    const amountNum = Number(draft.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("Enter a positive amount.");
      return;
    }
    if (!draft.date.trim()) {
      setError("Enter a date.");
      return;
    }
    // Discount is optional. Blank → 0; negative or non-numeric → 0
    // (normalizeAmount in the lib already clamps to ≥0).
    const discountRaw = draft.discount.trim();
    const discountNum = discountRaw === "" ? 0 : Number(discountRaw);
    const entry = createCashPayment({
      date: draft.date,
      amount: amountNum,
      discount: Number.isFinite(discountNum) ? discountNum : 0,
      paymentType: draft.paymentType,
      note: draft.note,
    });
    updatePatientPayments(patientId, (current) => [entry, ...current]);
    setDraft({
      date: getTodayUsDate(),
      amount: "",
      discount: "",
      paymentType: "Cash",
      note: "",
    });
  };

  const handleDelete = (id: string) => {
    const ok = window.confirm("Delete this payment? This cannot be undone.");
    if (!ok) return;
    updatePatientPayments(patientId, (current) =>
      current.filter((entry) => entry.id !== id),
    );
  };

  return (
    <section className="rounded-2xl border border-[#bfd2e0] bg-white p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl font-semibold">Cash Payments</h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">
            Total: {formatCashAmount(total)}
          </span>
          {totalDiscount > 0 && (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800">
              Discounts: {formatCashAmount(totalDiscount)}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3 md:grid-cols-[140px_120px_120px_160px_1fr_auto]">
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-[var(--text-muted)]">Date</span>
          <UsDateInput
            className="w-full rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 text-sm"
            onChange={(formatted) =>
              setDraft((current) => {
                // Auto-fill Amount from that date's encounter charges,
                // but ONLY when the user hasn't already typed an
                // amount — never override their input. They can still
                // edit the auto-filled value after.
                const next = { ...current, date: formatted };
                if (!current.amount.trim()) {
                  const owed = draftOwed(formatted);
                  if (owed > 0) {
                    next.amount = owed.toFixed(2);
                  }
                }
                return next;
              })
            }
            value={draft.date}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-[var(--text-muted)]">
            Amount
            {draftOwed(draft.date) > 0 && (
              <span className="ml-1 text-[10px] font-normal text-emerald-700">
                (owed {formatCashAmount(draftOwed(draft.date))})
              </span>
            )}
          </span>
          <input
            className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 text-sm"
            inputMode="decimal"
            onChange={(event) =>
              setDraft((current) => ({ ...current, amount: event.target.value }))
            }
            placeholder="0.00"
            value={draft.amount}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-[var(--text-muted)]">Discount</span>
          <input
            className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 text-sm"
            inputMode="decimal"
            onChange={(event) =>
              setDraft((current) => ({ ...current, discount: event.target.value }))
            }
            placeholder="0.00"
            value={draft.discount}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-[var(--text-muted)]">Payment</span>
          <select
            className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 text-sm"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                paymentType: event.target.value as CashPaymentEntry["paymentType"],
              }))
            }
            value={draft.paymentType}
          >
            {cashPaymentTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-[var(--text-muted)]">Note</span>
          <input
            className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 text-sm"
            onChange={(event) =>
              setDraft((current) => ({ ...current, note: event.target.value }))
            }
            placeholder="Optional note"
            value={draft.note}
          />
        </label>
        <div className="flex items-end">
          <button
            className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white transition-all active:scale-[0.97]"
            onClick={handleAdd}
            type="button"
          >
            Add
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-2 text-sm font-semibold text-[#b43b34]">{error}</p>
      )}

      {entries.length > 0 ? (
        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--line-soft)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-soft)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-right">Owed</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Discount</th>
                <th className="px-3 py-2 text-left">Payment</th>
                <th className="px-3 py-2 text-left">Note</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const owed = owedByDate.get(entry.date) ?? 0;
                return (
                  <tr
                    className="border-t border-[var(--line-soft)]"
                    key={entry.id}
                  >
                    <td className="px-3 py-2 font-mono">{entry.date}</td>
                    <td className="px-3 py-2 text-right text-[var(--text-muted)]">
                      {owed > 0 ? formatCashAmount(owed) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatCashAmount(entry.amount)}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--text-muted)]">
                      {entry.discount ? formatCashAmount(entry.discount) : "—"}
                    </td>
                    <td className="px-3 py-2">{entry.paymentType}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">
                      {entry.note ?? ""}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700"
                        onClick={() => handleDelete(entry.id)}
                        type="button"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-[var(--bg-soft)]">
              <tr>
                <td className="px-3 py-2 text-right font-semibold" colSpan={1}>
                  Total
                </td>
                <td className="px-3 py-2 text-right font-semibold text-[var(--text-muted)]">
                  {(() => {
                    // Sum owed across each UNIQUE entry date — don't
                    // double-count if the office logged two cash rows
                    // for the same encounter day.
                    const seen = new Set<string>();
                    let sum = 0;
                    for (const e of entries) {
                      if (seen.has(e.date)) continue;
                      seen.add(e.date);
                      sum += owedByDate.get(e.date) ?? 0;
                    }
                    return sum > 0 ? formatCashAmount(sum) : "—";
                  })()}
                </td>
                <td className="px-3 py-2 text-right font-bold">
                  {formatCashAmount(total)}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-[var(--text-muted)]">
                  {totalDiscount > 0 ? formatCashAmount(totalDiscount) : "—"}
                </td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-[var(--line-soft)] bg-white px-3 py-4 text-center text-sm text-[var(--text-muted)]">
          No payments recorded yet.
        </p>
      )}
    </section>
  );
}
