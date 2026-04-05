"use client";

import { useMemo, useRef, useState } from "react";
import {
  RichTextTemplateEditor,
  type RichTextTemplateEditorHandle,
} from "@/components/rich-text-template-editor";
import { useReportTemplates } from "@/hooks/use-report-templates";
import { documentFontOptions } from "@/lib/document-templates";
import { narrativeReportAutoFields } from "@/lib/report-templates";

function insertionTokenForField(fieldToken: string) {
  return `{{${fieldToken}}}`;
}

type FieldCategory = {
  label: string;
  tokens: string[];
};

const autoFieldCategories: FieldCategory[] = [
  {
    label: "Office",
    tokens: ["TODAY_DATE", "OFFICE_NAME", "OFFICE_ADDRESS", "OFFICE_PHONE", "OFFICE_FAX", "OFFICE_EMAIL", "DOCTOR_NAME"],
  },
  {
    label: "Patient",
    tokens: ["PATIENT_FULL_NAME", "PATIENT_FIRST_NAME", "PATIENT_LAST_NAME", "PATIENT_DOB", "PATIENT_PHONE", "PATIENT_EMAIL"],
  },
  {
    label: "Case Info",
    tokens: ["DATE_OF_INJURY", "INITIAL_EXAM", "CASE_NUMBER", "CASE_STATUS", "LIEN_STATUS", "PRIOR_CARE", "PATIENT_NOTES"],
  },
  {
    label: "Findings",
    tokens: ["XRAY_FINDINGS", "MRI_CT_FINDINGS", "SPECIALIST_RECOMMENDATIONS"],
  },
  {
    label: "Billing",
    tokens: ["BILLED_AMOUNT", "PAID_AMOUNT", "PERCENTAGE_PAID", "PAID_DATE", "TOTAL_CHARGE_AMOUNT"],
  },
  {
    label: "Dates & Status",
    tokens: ["DISCHARGE_DATE", "RB_SENT_DATE", "REVIEW_STATUS"],
  },
  {
    label: "Encounters",
    tokens: [
      "FIRST_ENCOUNTER_DATE", "LATEST_ENCOUNTER_DATE", "ENCOUNTER_COUNT", "ENCOUNTER_TIMELINE",
    ],
  },
  {
    label: "SOAP — First",
    tokens: ["FIRST_SUBJECTIVE", "FIRST_OBJECTIVE", "FIRST_ASSESSMENT", "FIRST_PLAN"],
  },
  {
    label: "SOAP — Latest",
    tokens: ["LATEST_SUBJECTIVE", "LATEST_OBJECTIVE", "LATEST_ASSESSMENT", "LATEST_PLAN"],
  },
  {
    label: "SOAP — All",
    tokens: ["ALL_SUBJECTIVE", "ALL_OBJECTIVE", "ALL_ASSESSMENT", "ALL_PLAN"],
  },
  {
    label: "SOAP — Macro",
    tokens: ["MACRO_SUBJECTIVE", "MACRO_OBJECTIVE", "MACRO_ASSESSMENT", "MACRO_PLAN"],
  },
  {
    label: "Diagnosis & Charges",
    tokens: ["DIAGNOSIS_LIST", "DIAGNOSIS_CODES", "CHARGE_LEDGER"],
  },
  {
    label: "Imaging & Referrals",
    tokens: ["XRAY_SUMMARY", "XRAY_SENT_DATE", "XRAY_COMPLETED_DATE", "XRAY_REVIEWED_DATE", "MRI_CT_SUMMARY", "MRI_SENT_DATE", "MRI_SCHEDULED_DATE", "MRI_COMPLETED_DATE", "MRI_REVIEWED_DATE", "SPECIALIST_SUMMARY"],
  },
];

const tokenLabelMap = Object.fromEntries(
  narrativeReportAutoFields.map((f) => [f.token, f.label]),
);

export function ReportTemplateSettingsPanel() {
  const {
    reportTemplates,
    addTemplate,
    updateTemplate,
    removeTemplate,
    addPrompt,
    updatePrompt,
    removePrompt,
    resetToDefaults,
  } = useReportTemplates();

  const bodyEditorRef = useRef<RichTextTemplateEditorHandle | null>(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    reportTemplates.templates[0]?.id ?? null,
  );
  const [templateNameDraft, setTemplateNameDraft] = useState("Insurance Narrative");
  const [autoFieldSearch, setAutoFieldSearch] = useState("");
  const [error, setError] = useState("");

  const [promptLabelDraft, setPromptLabelDraft] = useState("");
  const [promptOptionsDraft, setPromptOptionsDraft] = useState("");
  const [promptRequiredDraft, setPromptRequiredDraft] = useState(false);
  const [promptOptionsDrafts, setPromptOptionsDrafts] = useState<Record<string, string>>({});

  const selectedTemplate = useMemo(() => {
    if (selectedTemplateId) {
      const matched = reportTemplates.templates.find((entry) => entry.id === selectedTemplateId);
      if (matched) {
        return matched;
      }
    }
    return reportTemplates.templates[0] ?? null;
  }, [reportTemplates.templates, selectedTemplateId]);

  const usedFieldTokens = useMemo(() => {
    if (!selectedTemplate) {
      return [];
    }
    const allowed = new Set(
      [...narrativeReportAutoFields.map((field) => field.token), ...selectedTemplate.prompts.map((prompt) => prompt.token)],
    );
    const used = new Set<string>();
    const matches = selectedTemplate.body.matchAll(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g);
    for (const match of matches) {
      const token = (match[1] ?? "").toUpperCase();
      if (allowed.has(token)) {
        used.add(token);
      }
    }
    return Array.from(used);
  }, [selectedTemplate]);

  const handleAddTemplate = () => {
    const createdId = addTemplate(
      templateNameDraft,
      `Narrative Report\n\nPatient: {{PATIENT_FULL_NAME}}\nDate Of Injury: {{DATE_OF_INJURY}}\n\nHistory:\n{{FIRST_OBJECTIVE}}`,
    );
    if (!createdId) {
      setError("Could not add template. Name may be missing or already in use.");
      return;
    }
    setError("");
    setTemplateNameDraft("");
    setSelectedTemplateId(createdId);
  };

  const handleAddPrompt = () => {
    if (!selectedTemplate) {
      return;
    }
    const wasAdded = addPrompt(selectedTemplate.id, promptLabelDraft, promptOptionsDraft, promptRequiredDraft);
    if (!wasAdded) {
      setError("Prompt label is required.");
      return;
    }
    setError("");
    setPromptLabelDraft("");
    setPromptOptionsDraft("");
    setPromptRequiredDraft(false);
  };

  const insertTextAtCursor = (text: string) => {
    if (!selectedTemplate) {
      return;
    }
    if (bodyEditorRef.current) {
      bodyEditorRef.current.insertText(text);
      return;
    }
    updateTemplate(selectedTemplate.id, { body: `${selectedTemplate.body}${text}` });
  };

  const getPromptDraftKey = (templateId: string, promptId: string) => `${templateId}::${promptId}`;

  const commitPromptOptionsDraft = (templateId: string, promptId: string) => {
    const key = getPromptDraftKey(templateId, promptId);
    const draft = promptOptionsDrafts[key];
    if (draft === undefined) {
      return;
    }
    updatePrompt(templateId, promptId, { optionsDraft: draft });
    setPromptOptionsDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  if (!selectedTemplate) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
          onClick={() => { if (window.confirm("Are you sure you want to reset to defaults? This will overwrite your current settings.")) resetToDefaults(); }}
          type="button"
        >
          Reset Report Template Defaults
        </button>
      </div>

      {error && <p className="text-sm font-semibold text-[#b43b34]">{error}</p>}

      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <article className="rounded-xl border border-[var(--line-soft)] bg-white p-3">
          <h4 className="text-lg font-semibold">Narrative Templates</h4>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Build long-form reports from patient data + encounter notes + runtime prompts.
          </p>

          <div className="mt-3 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3">
            <label className="grid gap-1">
              <span className="text-sm font-semibold text-[var(--text-muted)]">Template Name</span>
              <input
                className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                onChange={(event) => setTemplateNameDraft(event.target.value)}
                placeholder="Example: Full PI Narrative"
                value={templateNameDraft}
              />
            </label>
            <button
              className="mt-2 w-full rounded-xl bg-[var(--brand-primary)] px-4 py-2 font-semibold text-white"
              onClick={handleAddTemplate}
              type="button"
            >
              Add Template
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {reportTemplates.templates.map((template) => (
              <button
                className={`w-full rounded-xl border px-3 py-2 text-left ${
                  template.id === selectedTemplate.id
                    ? "border-[var(--brand-primary)] bg-[rgba(13,121,191,0.08)]"
                    : "border-[var(--line-soft)] bg-[var(--bg-soft)]"
                }`}
                key={template.id}
                onClick={() => {
                  setSelectedTemplateId(template.id);
                  setError("");
                }}
                type="button"
              >
                <p className="font-semibold">{template.name}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Prompts: {template.prompts.length} • {template.active ? "Active" : "Inactive"}
                </p>
              </button>
            ))}
          </div>
        </article>

        <article className="rounded-xl border border-[var(--line-soft)] bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xl font-semibold">Edit Narrative Template</h4>
            <button
              className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
              disabled={reportTemplates.templates.length <= 1}
              onClick={() => {
                removeTemplate(selectedTemplate.id);
                if (selectedTemplateId === selectedTemplate.id) {
                  const fallback = reportTemplates.templates.find((entry) => entry.id !== selectedTemplate.id);
                  setSelectedTemplateId(fallback?.id ?? null);
                }
              }}
              type="button"
            >
              Delete Template
            </button>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_260px_auto]">
            <label className="grid gap-1">
              <span className="text-sm font-semibold text-[var(--text-muted)]">Template Name</span>
              <input
                className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                onChange={(event) => updateTemplate(selectedTemplate.id, { name: event.target.value })}
                value={selectedTemplate.name}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-semibold text-[var(--text-muted)]">Font</span>
              <select
                className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                onChange={(event) => updateTemplate(selectedTemplate.id, { fontFamily: event.target.value })}
                value={selectedTemplate.fontFamily}
              >
                {documentFontOptions.map((fontOption) => (
                  <option key={fontOption.value} value={fontOption.value}>
                    {fontOption.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-end gap-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] px-3 py-2 font-semibold">
              <input
                checked={selectedTemplate.active}
                onChange={(event) => updateTemplate(selectedTemplate.id, { active: event.target.checked })}
                type="checkbox"
              />
              Active
            </label>
          </div>

          <label className="mt-3 grid gap-1">
            <span className="text-sm font-semibold text-[var(--text-muted)]">Template Body</span>
            <RichTextTemplateEditor
              ref={bodyEditorRef}
              fontFamily={selectedTemplate.fontFamily}
              minHeightClassName="min-h-[340px]"
              onChange={(nextValue) => updateTemplate(selectedTemplate.id, { body: nextValue })}
              placeholder="Build your narrative template..."
              value={selectedTemplate.body}
            />
          </label>

          <article className="mt-4 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h5 className="text-lg font-semibold">Choose Your Auto Fields</h5>
              <span className="text-sm font-semibold text-[var(--text-muted)]">
                Selected: {usedFieldTokens.length}
              </span>
            </div>

            <input
              className="mb-3 w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2 text-sm"
              onChange={(event) => setAutoFieldSearch(event.target.value)}
              placeholder="Search fields... (e.g. objective, patient, billing)"
              value={autoFieldSearch}
            />

            {(() => {
              const q = autoFieldSearch.trim().toLowerCase();

              const filteredCategories = autoFieldCategories
                .map((cat) => {
                  const matchingTokens = cat.tokens.filter((token) => {
                    if (!q) return true;
                    const label = (tokenLabelMap[token] ?? token).toLowerCase();
                    return token.toLowerCase().includes(q) || label.includes(q) || cat.label.toLowerCase().includes(q);
                  });
                  return { ...cat, tokens: matchingTokens };
                })
                .filter((cat) => cat.tokens.length > 0);

              const filteredPrompts = selectedTemplate.prompts.filter((prompt) => {
                if (!q) return true;
                return (
                  prompt.token.toLowerCase().includes(q) ||
                  prompt.label.toLowerCase().includes(q)
                );
              });

              if (filteredCategories.length === 0 && filteredPrompts.length === 0) {
                return (
                  <p className="py-4 text-center text-sm text-[var(--text-muted)]">
                    No fields match &ldquo;{autoFieldSearch.trim()}&rdquo;
                  </p>
                );
              }

              return (
                <div className="space-y-3">
                  {filteredCategories.map((cat) => (
                    <div key={cat.label}>
                      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                        {cat.label}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {cat.tokens.map((token) => {
                          const used = usedFieldTokens.includes(token);
                          const label = tokenLabelMap[token] ?? token;
                          return (
                            <button
                              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                used
                                  ? "border-[var(--brand-primary)] bg-[rgba(13,121,191,0.12)] text-[var(--brand-primary)]"
                                  : "border-[var(--line-soft)] bg-white hover:border-[var(--brand-primary)] hover:bg-[rgba(13,121,191,0.04)]"
                              }`}
                              key={token}
                              onClick={() => insertTextAtCursor(insertionTokenForField(token))}
                              title={label}
                              type="button"
                            >
                              {used ? "✓ " : ""}
                              {token}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {filteredPrompts.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                        Custom Prompts
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {filteredPrompts.map((prompt) => {
                          const used = usedFieldTokens.includes(prompt.token);
                          return (
                            <button
                              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                used
                                  ? "border-[var(--brand-primary)] bg-[rgba(13,121,191,0.12)] text-[var(--brand-primary)]"
                                  : "border-[var(--line-soft)] bg-white hover:border-[var(--brand-primary)] hover:bg-[rgba(13,121,191,0.04)]"
                              }`}
                              key={prompt.id}
                              onClick={() => insertTextAtCursor(insertionTokenForField(prompt.token))}
                              title={prompt.label}
                              type="button"
                            >
                              {used ? "✓ " : ""}
                              {prompt.token}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </article>

          <article className="mt-4 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3">
            <h5 className="text-lg font-semibold">Question Prompts</h5>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              These prompts appear when generating the narrative so users can input custom details.
            </p>

            <div className="mt-3 grid gap-2 rounded-xl border border-[var(--line-soft)] bg-white p-2 md:grid-cols-[1fr_1fr_auto_auto]">
              <input
                className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-2"
                onChange={(event) => setPromptLabelDraft(event.target.value)}
                placeholder="Prompt label (e.g. Current symptoms)"
                value={promptLabelDraft}
              />
              <input
                className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-2"
                onChange={(event) => setPromptOptionsDraft(event.target.value)}
                placeholder="Options comma-separated (optional)"
                value={promptOptionsDraft}
              />
              <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-soft)] px-3 py-2 text-sm font-semibold">
                <input
                  checked={promptRequiredDraft}
                  onChange={(event) => setPromptRequiredDraft(event.target.checked)}
                  type="checkbox"
                />
                Required
              </label>
              <button
                className="rounded-lg bg-[var(--brand-primary)] px-3 py-2 font-semibold text-white"
                onClick={handleAddPrompt}
                type="button"
              >
                Add
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {selectedTemplate.prompts.map((prompt) => (
                <div
                  className="rounded-xl border border-[var(--line-soft)] bg-white p-2"
                  key={prompt.id}
                >
                  <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto_auto]">
                    <input
                      className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1.5"
                      onChange={(event) =>
                        updatePrompt(selectedTemplate.id, prompt.id, { label: event.target.value })
                      }
                      value={prompt.label}
                    />
                    <input
                      className="rounded-lg border border-[var(--line-soft)] bg-white px-2 py-1.5"
                      onBlur={() => commitPromptOptionsDraft(selectedTemplate.id, prompt.id)}
                      onChange={(event) =>
                        setPromptOptionsDrafts((current) => ({
                          ...current,
                          [getPromptDraftKey(selectedTemplate.id, prompt.id)]: event.target.value,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitPromptOptionsDraft(selectedTemplate.id, prompt.id);
                        }
                      }}
                      placeholder="options..."
                      value={
                        promptOptionsDrafts[getPromptDraftKey(selectedTemplate.id, prompt.id)] ??
                        prompt.options.join(", ")
                      }
                    />
                    <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-soft)] px-3 py-1.5 text-sm font-semibold">
                      <input
                        checked={prompt.required}
                        onChange={(event) =>
                          updatePrompt(selectedTemplate.id, prompt.id, { required: event.target.checked })
                        }
                        type="checkbox"
                      />
                      Required
                    </label>
                    <button
                      className="rounded-lg border border-[var(--line-soft)] bg-white px-3 py-1.5 font-semibold"
                      onClick={() => insertTextAtCursor(insertionTokenForField(prompt.token))}
                      type="button"
                    >
                      Insert Token
                    </button>
                    <button
                      className="rounded-lg border border-[var(--line-soft)] bg-white px-3 py-1.5 font-semibold"
                      onClick={() => { if (window.confirm(`Remove prompt "${prompt.label}"?`)) removePrompt(selectedTemplate.id, prompt.id); }}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">Token: {insertionTokenForField(prompt.token)}</p>
                </div>
              ))}
              {selectedTemplate.prompts.length === 0 && (
                <p className="text-sm text-[var(--text-muted)]">No prompts added yet.</p>
              )}
            </div>
          </article>
        </article>
      </div>
    </div>
  );
}
