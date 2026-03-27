"use client";

import { useMemo, useState } from "react";
import { useBillingMacros } from "@/hooks/use-billing-macros";
import { GENERAL_DIAGNOSIS_FOLDER_ID } from "@/lib/billing-macros";

export function BillingMacroSettingsPanel() {
  const {
    billingMacros,
    addTreatment,
    updateTreatment,
    removeTreatment,
    addDiagnosis,
    updateDiagnosis,
    removeDiagnosis,
    addDiagnosisFolder,
    updateDiagnosisFolder,
    moveDiagnosisFolder,
    removeDiagnosisFolder,
    addBundle,
    updateBundle,
    removeBundle,
    resetToDefaults,
  } = useBillingMacros();

  const [treatmentDraft, setTreatmentDraft] = useState({
    name: "",
    procedureCode: "",
    unitPrice: 0,
    defaultUnits: 1,
  });
  const [diagnosisDraft, setDiagnosisDraft] = useState({
    code: "",
    description: "",
    folderId: "",
  });
  const [diagnosisFolderDraft, setDiagnosisFolderDraft] = useState("");
  const [bundleNameDraft, setBundleNameDraft] = useState("");
  const [bundleDiagnosisDraft, setBundleDiagnosisDraft] = useState<string[]>([]);
  const [error, setError] = useState("");

  const diagnosisById = useMemo(
    () => new Map(billingMacros.diagnoses.map((entry) => [entry.id, entry] as const)),
    [billingMacros.diagnoses],
  );
  const diagnosisFolderById = useMemo(
    () => new Map(billingMacros.diagnosisFolders.map((entry) => [entry.id, entry] as const)),
    [billingMacros.diagnosisFolders],
  );
  const diagnosesByFolder = useMemo(() => {
    const grouped = new Map<string, typeof billingMacros.diagnoses>();
    billingMacros.diagnosisFolders.forEach((folder) => {
      grouped.set(folder.id, []);
    });
    const fallbackFolderId = billingMacros.diagnosisFolders[0]?.id ?? "";
    billingMacros.diagnoses.forEach((entry) => {
      const targetFolderId = grouped.has(entry.folderId) ? entry.folderId : fallbackFolderId;
      if (!targetFolderId) {
        return;
      }
      const bucket = grouped.get(targetFolderId);
      if (bucket) {
        bucket.push(entry);
      }
    });
    return grouped;
  }, [billingMacros.diagnoses, billingMacros.diagnosisFolders]);

  const handleAddTreatment = () => {
    const added = addTreatment(treatmentDraft);
    if (!added) {
      setError("Could not add treatment macro. Name/code may be missing or duplicated.");
      return;
    }
    setError("");
    setTreatmentDraft({
      name: "",
      procedureCode: "",
      unitPrice: 0,
      defaultUnits: 1,
    });
  };

  const handleAddDiagnosis = () => {
    const added = addDiagnosis({
      code: diagnosisDraft.code,
      description: diagnosisDraft.description,
      folderId: diagnosisDraft.folderId || billingMacros.diagnosisFolders[0]?.id,
    });
    if (!added) {
      setError("Could not add diagnosis code. Code/description may be missing or duplicated.");
      return;
    }
    setError("");
    setDiagnosisDraft({
      code: "",
      description: "",
      folderId: diagnosisDraft.folderId || billingMacros.diagnosisFolders[0]?.id || "",
    });
  };

  const handleAddDiagnosisFolder = () => {
    const added = addDiagnosisFolder(diagnosisFolderDraft);
    if (!added) {
      setError("Could not add diagnosis folder. Name may be missing or duplicated.");
      return;
    }
    setError("");
    setDiagnosisFolderDraft("");
  };

  const handleAddBundle = () => {
    const added = addBundle(bundleNameDraft, bundleDiagnosisDraft);
    if (!added) {
      setError("Could not add bundle. Give it a name and include at least one diagnosis code.");
      return;
    }
    setError("");
    setBundleNameDraft("");
    setBundleDiagnosisDraft([]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
          onClick={resetToDefaults}
          type="button"
        >
          Reset Billing Macro Defaults
        </button>
      </div>

      {error && <p className="text-sm font-semibold text-[#b43b34]">{error}</p>}

      <article className="rounded-xl border border-[var(--line-soft)] bg-white p-4">
        <h4 className="text-lg font-semibold">Treatment Macros</h4>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          These define CPT/procedure code, price per unit, and default units used when adding ledger charges.
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Default Units are auto-filled when you add this treatment to Billing. Most services are set to 1.
        </p>

        <div className="mt-3 grid gap-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3 md:grid-cols-[1.4fr_140px_120px_120px_auto]">
          <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] md:col-span-5">
            Add New Treatment Macro
          </p>
          <label className="grid gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
              Treatment Name
            </span>
            <input
              aria-label="Treatment Name"
              className="rounded-lg border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) => setTreatmentDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Treatment name"
              value={treatmentDraft.name}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
              CPT / Code
            </span>
            <input
              aria-label="CPT / Code"
              className="rounded-lg border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) =>
                setTreatmentDraft((current) => ({ ...current, procedureCode: event.target.value }))
              }
              placeholder="CPT / Code"
              value={treatmentDraft.procedureCode}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
              Price ($)
            </span>
            <input
              aria-label="Price ($)"
              className="rounded-lg border border-[var(--line-soft)] bg-white px-3 py-2"
              min={0}
              onChange={(event) =>
                setTreatmentDraft((current) => ({ ...current, unitPrice: Number(event.target.value) || 0 }))
              }
              placeholder="Price ($)"
              step="0.01"
              type="number"
              value={treatmentDraft.unitPrice}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
              Default Units
            </span>
            <input
              aria-label="Default Units"
              className="rounded-lg border border-[var(--line-soft)] bg-white px-3 py-2"
              min={1}
              onChange={(event) =>
                setTreatmentDraft((current) => ({ ...current, defaultUnits: Number(event.target.value) || 1 }))
              }
              placeholder="Default units"
              type="number"
              value={treatmentDraft.defaultUnits}
            />
          </label>
          <div className="flex items-end">
            <button
              className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-2 font-semibold text-white"
              onClick={handleAddTreatment}
              type="button"
            >
              Add Treatment
            </button>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <div className="hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)] md:grid md:grid-cols-[1.4fr_140px_120px_120px_80px_90px]">
            <span>Treatment Name</span>
            <span>CPT / Code</span>
            <span>Price ($)</span>
            <span>Default Units</span>
            <span>Status</span>
            <span>Action</span>
          </div>
          {billingMacros.treatments.map((entry) => (
            <div
              key={entry.id}
              className="grid gap-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-2 md:grid-cols-[1.4fr_140px_120px_120px_80px_90px]"
            >
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)] md:hidden">
                  Treatment Name
                </span>
                <input
                  aria-label="Treatment Name"
                  className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1"
                  onChange={(event) => updateTreatment(entry.id, { name: event.target.value })}
                  value={entry.name}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)] md:hidden">
                  CPT / Code
                </span>
                <input
                  aria-label="CPT / Code"
                  className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1"
                  onChange={(event) => updateTreatment(entry.id, { procedureCode: event.target.value })}
                  value={entry.procedureCode}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)] md:hidden">
                  Price ($)
                </span>
                <input
                  aria-label="Price ($)"
                  className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1"
                  min={0}
                  onChange={(event) => updateTreatment(entry.id, { unitPrice: Number(event.target.value) || 0 })}
                  step="0.01"
                  type="number"
                  value={entry.unitPrice}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)] md:hidden">
                  Default Units
                </span>
                <input
                  aria-label="Default Units"
                  className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1"
                  min={1}
                  onChange={(event) => updateTreatment(entry.id, { defaultUnits: Number(event.target.value) || 1 })}
                  type="number"
                  value={entry.defaultUnits}
                />
              </label>
              <div className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)] md:hidden">
                  Status
                </span>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    checked={entry.active}
                    onChange={(event) => updateTreatment(entry.id, { active: event.target.checked })}
                    type="checkbox"
                  />
                  Active
                </label>
              </div>
              <div className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)] md:hidden">
                  Action
                </span>
                <button
                  className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 text-sm font-semibold"
                  onClick={() => removeTreatment(entry.id)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-xl border border-[var(--line-soft)] bg-white p-4">
        <h4 className="text-lg font-semibold">Diagnosis Macro Settings</h4>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Organize your ICD-10 library with folders, then group common sets into one-click bundles.
        </p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <article className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3">
            <h5 className="text-base font-semibold">Diagnosis Folders</h5>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Create folders like Cervical, Thoracic, Lumbar, etc. and assign codes to keep the picker clean.
            </p>
            <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
              <input
                className="rounded-lg border border-[var(--line-soft)] bg-white px-3 py-2"
                onChange={(event) => setDiagnosisFolderDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleAddDiagnosisFolder();
                  }
                }}
                placeholder="New folder name (e.g. Cervical)"
                value={diagnosisFolderDraft}
              />
              <button
                className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 font-semibold text-white"
                onClick={handleAddDiagnosisFolder}
                type="button"
              >
                Add Folder
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {billingMacros.diagnosisFolders.map((folder, index) => {
                const folderCount = diagnosesByFolder.get(folder.id)?.length ?? 0;
                const isLocked = folder.id === GENERAL_DIAGNOSIS_FOLDER_ID;
                return (
                  <div
                    key={folder.id}
                    className="grid gap-2 rounded-xl border border-[var(--line-soft)] bg-white p-2 md:grid-cols-[1fr_auto]"
                  >
                    <div className="grid gap-1">
                      <input
                        className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1"
                        onChange={(event) => updateDiagnosisFolder(folder.id, event.target.value)}
                        value={folder.name}
                      />
                      <p className="text-xs text-[var(--text-muted)]">{folderCount} code(s)</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        className="rounded-md border border-[var(--line-soft)] px-2 py-1 text-sm"
                        disabled={index === 0}
                        onClick={() => moveDiagnosisFolder(folder.id, "up")}
                        type="button"
                      >
                        ↑
                      </button>
                      <button
                        className="rounded-md border border-[var(--line-soft)] px-2 py-1 text-sm"
                        disabled={index === billingMacros.diagnosisFolders.length - 1}
                        onClick={() => moveDiagnosisFolder(folder.id, "down")}
                        type="button"
                      >
                        ↓
                      </button>
                      <button
                        className="rounded-md border border-[var(--line-soft)] px-2 py-1 text-sm"
                        disabled={isLocked || billingMacros.diagnosisFolders.length <= 1}
                        onClick={() => removeDiagnosisFolder(folder.id)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3">
            <h5 className="text-base font-semibold">Add Diagnosis Code</h5>
            <div className="mt-2 grid gap-2 md:grid-cols-[170px_1fr]">
              <input
                className="rounded-lg border border-[var(--line-soft)] bg-white px-3 py-2"
                onChange={(event) => setDiagnosisDraft((current) => ({ ...current, code: event.target.value }))}
                placeholder="ICD-10 code"
                value={diagnosisDraft.code}
              />
              <input
                className="rounded-lg border border-[var(--line-soft)] bg-white px-3 py-2"
                onChange={(event) =>
                  setDiagnosisDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Diagnosis description"
                value={diagnosisDraft.description}
              />
              <select
                className="rounded-lg border border-[var(--line-soft)] bg-white px-3 py-2 md:col-span-2"
                onChange={(event) =>
                  setDiagnosisDraft((current) => ({ ...current, folderId: event.target.value }))
                }
                value={diagnosisDraft.folderId || billingMacros.diagnosisFolders[0]?.id || ""}
              >
                {billingMacros.diagnosisFolders.map((folder) => (
                  <option key={`dx-folder-select-${folder.id}`} value={folder.id}>
                    Folder: {folder.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="mt-2 w-full rounded-xl bg-[var(--brand-primary)] px-4 py-2 font-semibold text-white"
              onClick={handleAddDiagnosis}
              type="button"
            >
              Add Diagnosis
            </button>
          </article>
        </div>

        <div className="mt-4 space-y-3">
          {billingMacros.diagnosisFolders.map((folder) => {
            const entries = [...(diagnosesByFolder.get(folder.id) ?? [])].sort((left, right) =>
              left.code.localeCompare(right.code),
            );
            return (
              <details
                className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3"
                key={`diagnosis-folder-group-${folder.id}`}
                open={entries.length > 0}
              >
                <summary className="cursor-pointer text-sm font-semibold">
                  {folder.name} ({entries.length})
                </summary>
                <div className="mt-2 space-y-2">
                  {entries.length === 0 && (
                    <p className="rounded-lg border border-[var(--line-soft)] bg-white px-3 py-2 text-sm text-[var(--text-muted)]">
                      No diagnosis codes in this folder yet.
                    </p>
                  )}
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="grid gap-2 rounded-xl border border-[var(--line-soft)] bg-white p-2 md:grid-cols-[180px_1fr_170px_80px_90px]"
                    >
                      <input
                        className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1"
                        onChange={(event) => updateDiagnosis(entry.id, { code: event.target.value })}
                        value={entry.code}
                      />
                      <input
                        className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1"
                        onChange={(event) => updateDiagnosis(entry.id, { description: event.target.value })}
                        value={entry.description}
                      />
                      <select
                        className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1"
                        onChange={(event) => updateDiagnosis(entry.id, { folderId: event.target.value })}
                        value={entry.folderId}
                      >
                        {billingMacros.diagnosisFolders.map((folderOption) => (
                          <option key={`${entry.id}-folder-${folderOption.id}`} value={folderOption.id}>
                            {folderOption.name}
                          </option>
                        ))}
                      </select>
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          checked={entry.active}
                          onChange={(event) => updateDiagnosis(entry.id, { active: event.target.checked })}
                          type="checkbox"
                        />
                        Active
                      </label>
                      <button
                        className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 text-sm font-semibold"
                        onClick={() => removeDiagnosis(entry.id)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
        </div>

        <div className="mt-5 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3">
          <h5 className="text-base font-semibold">Diagnosis Bundles</h5>
          <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
            <input
              className="rounded-lg border border-[var(--line-soft)] bg-white px-3 py-2"
              onChange={(event) => setBundleNameDraft(event.target.value)}
              placeholder="Bundle name (e.g. Cervical + Lumbar PI)"
              value={bundleNameDraft}
            />
            <button
              className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 font-semibold text-white"
              onClick={handleAddBundle}
              type="button"
            >
              Add Bundle
            </button>
          </div>
          <div className="mt-2 max-h-44 space-y-1 overflow-auto rounded-lg border border-[var(--line-soft)] bg-white p-2">
            {billingMacros.diagnoses.length === 0 && (
              <p className="text-sm text-[var(--text-muted)]">Add diagnosis macros first.</p>
            )}
            {billingMacros.diagnoses.map((entry) => (
              <label key={`bundle-draft-${entry.id}`} className="flex items-start gap-2 text-sm">
                <input
                  checked={bundleDiagnosisDraft.includes(entry.id)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setBundleDiagnosisDraft((current) =>
                      checked
                        ? Array.from(new Set([...current, entry.id]))
                        : current.filter((id) => id !== entry.id),
                    );
                  }}
                  type="checkbox"
                />
                <span>
                  <span className="font-semibold">{entry.code}</span> {entry.description}
                  <span className="ml-1 text-xs text-[var(--text-muted)]">
                    ({diagnosisFolderById.get(entry.folderId)?.name ?? "General"})
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-3 space-y-2">
            {billingMacros.bundles.map((bundle) => (
              <div key={bundle.id} className="rounded-xl border border-[var(--line-soft)] bg-white p-2">
                <div className="grid gap-2 md:grid-cols-[1fr_90px_90px]">
                  <input
                    className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1"
                    onChange={(event) => updateBundle(bundle.id, { name: event.target.value })}
                    value={bundle.name}
                  />
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      checked={bundle.active}
                      onChange={(event) => updateBundle(bundle.id, { active: event.target.checked })}
                      type="checkbox"
                    />
                    Active
                  </label>
                  <button
                    className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1 text-sm font-semibold"
                    onClick={() => removeBundle(bundle.id)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {bundle.diagnosisIds.length === 0 && (
                    <p className="text-xs text-[var(--text-muted)]">No diagnosis codes selected.</p>
                  )}
                  {bundle.diagnosisIds.map((diagnosisId) => {
                    const diagnosis = diagnosisById.get(diagnosisId);
                    if (!diagnosis) {
                      return null;
                    }
                    return (
                      <span
                        key={`${bundle.id}-${diagnosisId}`}
                        className="rounded-full border border-[var(--line-soft)] bg-[var(--bg-soft)] px-2 py-1 text-xs font-semibold"
                      >
                        {diagnosis.code}
                      </span>
                    );
                  })}
                </div>

                <div className="mt-2 max-h-36 space-y-1 overflow-auto rounded-lg border border-[var(--line-soft)] bg-[var(--bg-soft)] p-2">
                  {billingMacros.diagnoses.map((diagnosis) => (
                    <label key={`${bundle.id}-dx-${diagnosis.id}`} className="inline-flex items-center gap-2 text-xs">
                      <input
                        checked={bundle.diagnosisIds.includes(diagnosis.id)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          const nextIds = checked
                            ? Array.from(new Set([...bundle.diagnosisIds, diagnosis.id]))
                            : bundle.diagnosisIds.filter((id) => id !== diagnosis.id);
                          updateBundle(bundle.id, { diagnosisIds: nextIds });
                        }}
                        type="checkbox"
                      />
                      {diagnosis.code} - {diagnosis.description}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {billingMacros.bundles.length === 0 && (
              <p className="text-sm text-[var(--text-muted)]">No bundles yet.</p>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}
