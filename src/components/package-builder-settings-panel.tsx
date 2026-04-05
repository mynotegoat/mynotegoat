"use client";

import { useMemo, useState } from "react";
import { useBillingMacros } from "@/hooks/use-billing-macros";

function toCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function toPercent(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return "0%";
  }
  return `${value.toFixed(1)}%`;
}

export function PackageBuilderSettingsPanel() {
  const {
    billingMacros,
    addPackage,
    updatePackage,
    removePackage,
    addPackageTreatment,
    updatePackageTreatmentVisits,
    removePackageTreatment,
  } = useBillingMacros();

  const [packageDraft, setPackageDraft] = useState({
    name: "",
    totalVisits: 12,
    discountedPrice: 0,
  });
  const [packageTreatmentDrafts, setPackageTreatmentDrafts] = useState<
    Record<string, { treatmentId: string; visits: number }>
  >({});
  const [error, setError] = useState("");

  const activeTreatments = useMemo(
    () => billingMacros.treatments.filter((entry) => entry.active),
    [billingMacros.treatments],
  );
  const treatmentById = useMemo(
    () => new Map(billingMacros.treatments.map((entry) => [entry.id, entry] as const)),
    [billingMacros.treatments],
  );

  const handleAddPackage = () => {
    const added = addPackage({
      name: packageDraft.name,
      totalVisits: packageDraft.totalVisits,
      discountedPrice: packageDraft.discountedPrice,
    });
    if (!added) {
      setError("Could not add package. Name may be missing or already in use.");
      return;
    }
    setError("");
    setPackageDraft({
      name: "",
      totalVisits: 12,
      discountedPrice: 0,
    });
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm font-semibold text-[#b43b34]">{error}</p>}

      <article className="rounded-xl border border-[var(--line-soft)] bg-white p-4">
        <h4 className="text-lg font-semibold">Create Package</h4>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Build reusable cash packages (example: Diamond Package) with visit counts per CPT/treatment.
        </p>
        <div className="mt-3 grid grid-cols-12 gap-3 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3">
          <label className="col-span-12 grid min-w-0 gap-1 lg:col-span-6">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
              Package Name
            </span>
            <input
              className="rounded-lg border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) =>
                setPackageDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Example: Diamond Package"
              value={packageDraft.name}
            />
          </label>
          <label className="col-span-6 grid min-w-0 gap-1 lg:col-span-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
              Total Visits
            </span>
            <input
              className="rounded-lg border border-[var(--line-soft)] bg-white px-3 py-2"
              min={1}
              onChange={(event) =>
                setPackageDraft((current) => ({
                  ...current,
                  totalVisits: Math.max(1, Number(event.target.value) || 1),
                }))
              }
              type="number"
              value={packageDraft.totalVisits}
            />
          </label>
          <label className="col-span-6 grid min-w-0 gap-1 lg:col-span-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
              Discounted Price ($)
            </span>
            <input
              className="rounded-lg border border-[var(--line-soft)] bg-white px-3 py-2"
              min={0}
              onChange={(event) =>
                setPackageDraft((current) => ({
                  ...current,
                  discountedPrice: Math.max(0, Number(event.target.value) || 0),
                }))
              }
              step="0.01"
              type="number"
              value={packageDraft.discountedPrice}
            />
          </label>
          <div className="col-span-12 flex items-end lg:col-span-2">
            <button
              className="h-[42px] w-full rounded-xl bg-[var(--brand-primary)] px-4 py-2 font-semibold text-white"
              onClick={handleAddPackage}
              type="button"
            >
              Add Package
            </button>
          </div>
        </div>
      </article>

      <article className="rounded-xl border border-[var(--line-soft)] bg-white p-4">
        <h4 className="text-lg font-semibold">Package Library</h4>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Add treatment lines and visits per line. Discount percent is auto-calculated from retail total.
        </p>

        <div className="mt-3 space-y-3">
          {billingMacros.packages.length === 0 && (
            <p className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] px-3 py-3 text-sm text-[var(--text-muted)]">
              No packages yet.
            </p>
          )}

          {billingMacros.packages.map((entry) => {
            const assignedVisits = entry.items.reduce((sum, item) => sum + item.visits, 0);
            const retailTotal = entry.items.reduce((sum, item) => {
              const treatment = treatmentById.get(item.treatmentId);
              if (!treatment) {
                return sum;
              }
              return sum + treatment.unitPrice * treatment.defaultUnits * item.visits;
            }, 0);
            const discountAmount = Math.max(0, retailTotal - entry.discountedPrice);
            const discountPercent = retailTotal > 0 ? (discountAmount / retailTotal) * 100 : 0;
            const draft = packageTreatmentDrafts[entry.id] ?? { treatmentId: "", visits: entry.totalVisits };

            return (
              <div
                className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3"
                key={entry.id}
              >
                <div className="grid grid-cols-12 gap-3">
                  <label className="col-span-12 grid min-w-0 gap-1 lg:col-span-5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
                      Package Name
                    </span>
                    <input
                      className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1"
                      onChange={(event) => updatePackage(entry.id, { name: event.target.value })}
                      value={entry.name}
                    />
                  </label>
                  <label className="col-span-6 grid min-w-0 gap-1 lg:col-span-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
                      Total Visits
                    </span>
                    <input
                      className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1"
                      min={1}
                      onChange={(event) =>
                        updatePackage(entry.id, {
                          totalVisits: Math.max(1, Number(event.target.value) || 1),
                        })
                      }
                      type="number"
                      value={entry.totalVisits}
                    />
                  </label>
                  <label className="col-span-6 grid min-w-0 gap-1 lg:col-span-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
                      Discounted Price ($)
                    </span>
                    <input
                      className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1"
                      min={0}
                      onChange={(event) =>
                        updatePackage(entry.id, {
                          discountedPrice: Math.max(0, Number(event.target.value) || 0),
                        })
                      }
                      step="0.01"
                      type="number"
                      value={entry.discountedPrice}
                    />
                  </label>
                  <div className="col-span-6 flex items-end lg:col-span-1">
                    <label className="inline-flex h-[34px] w-full items-center justify-center gap-2 rounded-lg border border-[var(--line-soft)] bg-white px-3 text-sm font-semibold">
                      <input
                        checked={entry.active}
                        onChange={(event) => updatePackage(entry.id, { active: event.target.checked })}
                        type="checkbox"
                      />
                      Active
                    </label>
                  </div>
                  <div className="col-span-6 flex items-end lg:col-span-2">
                    <button
                      className="h-[34px] w-full rounded-lg border border-[var(--line-soft)] bg-white px-3 py-1 text-sm font-semibold"
                      onClick={() => { if (window.confirm(`Remove package "${entry.name}"?`)) removePackage(entry.id); }}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-12 gap-2 rounded-lg border border-[var(--line-soft)] bg-white p-2">
                  <label className="col-span-12 grid min-w-0 gap-1 lg:col-span-8">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
                      Treatment Macro
                    </span>
                    <select
                      className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1"
                      onChange={(event) =>
                        setPackageTreatmentDrafts((current) => ({
                          ...current,
                          [entry.id]: {
                            treatmentId: event.target.value,
                            visits: current[entry.id]?.visits ?? entry.totalVisits,
                          },
                        }))
                      }
                      value={draft.treatmentId}
                    >
                      <option value="">Select treatment macro</option>
                      {activeTreatments.map((treatment) => (
                        <option key={`${entry.id}-draft-treatment-${treatment.id}`} value={treatment.id}>
                          {treatment.name} ({treatment.procedureCode})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="col-span-6 grid min-w-0 gap-1 lg:col-span-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
                      Visits
                    </span>
                    <input
                      className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1"
                      min={1}
                      onChange={(event) =>
                        setPackageTreatmentDrafts((current) => ({
                          ...current,
                          [entry.id]: {
                            treatmentId: current[entry.id]?.treatmentId ?? "",
                            visits: Math.max(1, Number(event.target.value) || 1),
                          },
                        }))
                      }
                      type="number"
                      value={draft.visits}
                    />
                  </label>

                  <div className="col-span-6 flex items-end lg:col-span-2">
                    <button
                      className="h-[34px] w-full rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-sm font-semibold text-white"
                      onClick={() => {
                        if (!draft.treatmentId) {
                          setError("Select a treatment before adding it to package.");
                          return;
                        }
                        addPackageTreatment(entry.id, draft.treatmentId, draft.visits);
                        setError("");
                      }}
                      type="button"
                    >
                      Add / Update Line
                    </button>
                  </div>
                </div>

                <div className="mt-2 overflow-x-auto">
                  <div className="min-w-[640px] space-y-1">
                    <div className="grid grid-cols-[1.5fr_110px_130px_90px] gap-2 border-b border-[var(--line-soft)] pb-1 text-xs font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
                      <span>Treatment</span>
                      <span>Visits</span>
                      <span>Line Total</span>
                      <span />
                    </div>
                    {entry.items.length === 0 && (
                      <p className="py-2 text-sm text-[var(--text-muted)]">No treatment lines yet.</p>
                    )}
                    {entry.items.map((item) => {
                      const treatment = treatmentById.get(item.treatmentId);
                      if (!treatment) {
                        return null;
                      }
                      return (
                        <div
                          className="grid grid-cols-[1.5fr_110px_130px_90px] items-center gap-2"
                          key={`${entry.id}-${item.treatmentId}`}
                        >
                          <p className="text-sm font-semibold">
                            {treatment.name} ({treatment.procedureCode})
                          </p>
                          <input
                            className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1"
                            min={1}
                            onChange={(event) =>
                              updatePackageTreatmentVisits(
                                entry.id,
                                item.treatmentId,
                                Math.max(1, Number(event.target.value) || 1),
                              )
                            }
                            type="number"
                            value={item.visits}
                          />
                          <p className="text-sm font-semibold">
                            {toCurrency(treatment.unitPrice * treatment.defaultUnits * item.visits)}
                          </p>
                          <button
                            className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 text-sm font-semibold"
                            onClick={() => { if (window.confirm("Remove this treatment from the package?")) removePackageTreatment(entry.id, item.treatmentId); }}
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3 grid gap-2 rounded-lg border border-[var(--line-soft)] bg-white p-2 text-sm md:grid-cols-3">
                  <p>
                    <span className="font-semibold">Assigned Visits:</span> {assignedVisits}/{entry.totalVisits}
                  </p>
                  <p>
                    <span className="font-semibold">Retail Total:</span> {toCurrency(retailTotal)}
                  </p>
                  <p>
                    <span className="font-semibold">Discount:</span> {toPercent(discountPercent)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </article>
    </div>
  );
}
