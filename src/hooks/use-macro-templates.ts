"use client";

import { useCallback, useState } from "react";
import {
  createEmptyMacro,
  getDefaultMacroLibrary,
  loadMacroLibrary,
  macroAutoFields,
  saveMacroLibrary,
  type MacroAutoField,
  type MacroLibraryConfig,
  type MacroQuestion,
  type MacroSection,
  type MacroTemplate,
} from "@/lib/macro-templates";

export function useMacroTemplates() {
  const [macroLibrary, setMacroLibrary] = useState<MacroLibraryConfig>(() => loadMacroLibrary());

  const updateLibrary = useCallback((updater: (current: MacroLibraryConfig) => MacroLibraryConfig) => {
    setMacroLibrary((current) => {
      const next = updater(current);
      saveMacroLibrary(next);
      return next;
    });
  }, []);

  const setSetName = useCallback(
    (setName: string) => {
      updateLibrary((current) => ({
        ...current,
        setName,
      }));
    },
    [updateLibrary],
  );

  const toggleAutoField = useCallback(
    (field: MacroAutoField) => {
      updateLibrary((current) => {
        const exists = current.enabledAutoFields.includes(field);
        const next = exists
          ? current.enabledAutoFields.filter((entry) => entry !== field)
          : [...current.enabledAutoFields, field];

        if (!next.length) {
          return current;
        }

        const rank = new Map(macroAutoFields.map((entry, index) => [entry, index]));
        next.sort((left, right) => (rank.get(left) ?? 0) - (rank.get(right) ?? 0));

        return {
          ...current,
          enabledAutoFields: next,
        };
      });
    },
    [updateLibrary],
  );

  const addMacro = useCallback(
    (section: MacroSection, folder?: string) => {
      const newMacro = createEmptyMacro(section, folder);
      updateLibrary((current) => ({
        ...current,
        templates: [...current.templates, newMacro],
      }));
      return newMacro.id;
    },
    [updateLibrary],
  );

  const updateMacro = useCallback(
    (macroId: string, updater: (current: MacroTemplate) => MacroTemplate) => {
      updateLibrary((current) => ({
        ...current,
        templates: current.templates.map((template) => {
          if (template.id !== macroId) {
            return template;
          }
          return updater(template);
        }),
      }));
    },
    [updateLibrary],
  );

  const deleteMacro = useCallback(
    (macroId: string) => {
      updateLibrary((current) => ({
        ...current,
        templates: current.templates.filter((template) => template.id !== macroId),
      }));
    },
    [updateLibrary],
  );

  const addQuestion = useCallback(
    (macroId: string, question: MacroQuestion) => {
      updateMacro(macroId, (current) => {
        if (current.questions.some((entry) => entry.id === question.id)) {
          return current;
        }
        return {
          ...current,
          questions: [...current.questions, question],
        };
      });
    },
    [updateMacro],
  );

  const updateQuestion = useCallback(
    (macroId: string, questionId: string, updater: (current: MacroQuestion) => MacroQuestion) => {
      updateMacro(macroId, (current) => ({
        ...current,
        questions: current.questions.map((question) =>
          question.id === questionId ? updater(question) : question,
        ),
      }));
    },
    [updateMacro],
  );

  const removeQuestion = useCallback(
    (macroId: string, questionId: string) => {
      updateMacro(macroId, (current) => ({
        ...current,
        questions: current.questions.filter((question) => question.id !== questionId),
      }));
    },
    [updateMacro],
  );

  const moveQuestion = useCallback(
    (macroId: string, questionId: string, direction: "up" | "down") => {
      updateMacro(macroId, (current) => {
        const idx = current.questions.findIndex((q) => q.id === questionId);
        if (idx < 0) return current;
        const targetIdx = direction === "up" ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= current.questions.length) return current;
        const next = [...current.questions];
        [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
        return { ...current, questions: next };
      });
    },
    [updateMacro],
  );

  const resetToDefaults = useCallback(() => {
    const defaults = getDefaultMacroLibrary();
    setMacroLibrary(defaults);
    saveMacroLibrary(defaults);
  }, []);

  return {
    macroLibrary,
    setSetName,
    setSaltOnCreateDefault: (enabled: boolean) =>
      updateLibrary((current) => ({
        ...current,
        saltDefaults: {
          ...current.saltDefaults,
          enabled,
        },
      })),
    toggleSaltSectionDefault: (section: MacroSection) =>
      updateLibrary((current) => ({
        ...current,
        saltDefaults: {
          ...current.saltDefaults,
          sections: {
            ...current.saltDefaults.sections,
            [section]: !current.saltDefaults.sections[section],
          },
        },
      })),
    toggleAutoField,
    addMacro,
    updateMacro,
    deleteMacro,
    addQuestion,
    updateQuestion,
    removeQuestion,
    moveQuestion,
    resetToDefaults,
  };
}
