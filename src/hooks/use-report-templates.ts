"use client";

import { useCallback, useState } from "react";
import {
  createPromptTokenFromLabel,
  getDefaultNarrativeReportLibrary,
  loadNarrativeReportLibrary,
  saveNarrativeReportLibrary,
  type NarrativeReportLibrary,
  type NarrativeReportPrompt,
  type NarrativeReportTemplate,
} from "@/lib/report-templates";

function createTemplateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createPromptId() {
  return `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useReportTemplates() {
  const [reportTemplates, setReportTemplates] = useState<NarrativeReportLibrary>(() =>
    loadNarrativeReportLibrary(),
  );

  const updateLibrary = useCallback((updater: (current: NarrativeReportLibrary) => NarrativeReportLibrary) => {
    setReportTemplates((current) => {
      const next = updater(current);
      saveNarrativeReportLibrary(next);
      return next;
    });
  }, []);

  const addTemplate = useCallback(
    (nameDraft: string, bodyDraft: string) => {
      const name = nameDraft.trim();
      const body = bodyDraft.trim();
      if (!name || !body) {
        return null;
      }

      let createdId: string | null = null;
      updateLibrary((current) => {
        const duplicate = current.templates.some(
          (entry) => entry.name.toLowerCase() === name.toLowerCase(),
        );
        if (duplicate) {
          return current;
        }
        createdId = createTemplateId("report");
        return {
          ...current,
          templates: [
            ...current.templates,
            {
              id: createdId,
              name,
              body,
              fontFamily: current.templates[0]?.fontFamily ?? "Georgia, 'Times New Roman', serif",
              active: true,
              prompts: [],
            },
          ],
        };
      });

      return createdId;
    },
    [updateLibrary],
  );

  const updateTemplate = useCallback(
    (id: string, patch: Partial<Omit<NarrativeReportTemplate, "id" | "prompts">>) => {
      updateLibrary((current) => ({
        ...current,
        templates: current.templates.map((entry) => {
          if (entry.id !== id) {
            return entry;
          }
          return {
            ...entry,
            ...patch,
            name: patch.name === undefined ? entry.name : patch.name.trim(),
            body: patch.body === undefined ? entry.body : patch.body,
          };
        }),
      }));
    },
    [updateLibrary],
  );

  const removeTemplate = useCallback(
    (id: string) => {
      updateLibrary((current) => {
        const nextTemplates = current.templates.filter((entry) => entry.id !== id);
        if (!nextTemplates.length) {
          return getDefaultNarrativeReportLibrary();
        }
        return {
          ...current,
          templates: nextTemplates,
        };
      });
    },
    [updateLibrary],
  );

  const addPrompt = useCallback(
    (templateId: string, labelDraft: string, options: string[], required: boolean) => {
      const label = labelDraft.trim();
      if (!label) {
        return false;
      }
      updateLibrary((current) => ({
        ...current,
        templates: current.templates.map((template) => {
          if (template.id !== templateId) {
            return template;
          }

          const tokenBase = createPromptTokenFromLabel(label);
          const usedTokens = new Set(template.prompts.map((entry) => entry.token));
          let token = tokenBase;
          let sequence = 2;
          while (usedTokens.has(token)) {
            token = `${tokenBase}_${sequence}`;
            sequence += 1;
          }

          const nextPrompt: NarrativeReportPrompt = {
            id: createPromptId(),
            label,
            token,
            options,
            required,
          };

          return {
            ...template,
            prompts: [...template.prompts, nextPrompt],
          };
        }),
      }));
      return true;
    },
    [updateLibrary],
  );

  const updatePrompt = useCallback(
    (
      templateId: string,
      promptId: string,
      patch: Partial<Pick<NarrativeReportPrompt, "label" | "required" | "options">>,
    ) => {
      updateLibrary((current) => ({
        ...current,
        templates: current.templates.map((template) => {
          if (template.id !== templateId) {
            return template;
          }
          return {
            ...template,
            prompts: template.prompts.map((prompt) => {
              if (prompt.id !== promptId) {
                return prompt;
              }
              return {
                ...prompt,
                label: patch.label === undefined ? prompt.label : patch.label,
                required: patch.required === undefined ? prompt.required : patch.required,
                options: patch.options === undefined ? prompt.options : patch.options,
              };
            }),
          };
        }),
      }));
    },
    [updateLibrary],
  );

  const removePrompt = useCallback(
    (templateId: string, promptId: string) => {
      updateLibrary((current) => ({
        ...current,
        templates: current.templates.map((template) => {
          if (template.id !== templateId) {
            return template;
          }
          return {
            ...template,
            prompts: template.prompts.filter((prompt) => prompt.id !== promptId),
          };
        }),
      }));
    },
    [updateLibrary],
  );

  const resetToDefaults = useCallback(() => {
    const defaults = getDefaultNarrativeReportLibrary();
    setReportTemplates(defaults);
    saveNarrativeReportLibrary(defaults);
  }, []);

  return {
    reportTemplates,
    addTemplate,
    updateTemplate,
    removeTemplate,
    addPrompt,
    updatePrompt,
    removePrompt,
    resetToDefaults,
  };
}
