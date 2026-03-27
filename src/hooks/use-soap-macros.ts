"use client";

import { useCallback, useState } from "react";
import {
  getDefaultSoapMacros,
  loadSoapMacros,
  saveSoapMacros,
  type SoapMacroConfig,
  type SoapSection,
} from "@/lib/soap-macros";

function upsertMacroList(current: string[], nextMacro: string) {
  const trimmed = nextMacro.trim();
  if (!trimmed) {
    return current;
  }

  const lower = trimmed.toLowerCase();
  if (current.some((item) => item.toLowerCase() === lower)) {
    return current;
  }

  return [...current, trimmed];
}

export function useSoapMacros() {
  const [macros, setMacros] = useState<SoapMacroConfig>(() => loadSoapMacros());

  const updateMacros = useCallback((updater: (current: SoapMacroConfig) => SoapMacroConfig) => {
    setMacros((current) => {
      const next = updater(current);
      saveSoapMacros(next);
      return next;
    });
  }, []);

  const addMacro = useCallback(
    (section: SoapSection, nextMacro: string) => {
      updateMacros((current) => {
        const nextList = upsertMacroList(current[section], nextMacro);
        if (nextList === current[section]) {
          return current;
        }
        return {
          ...current,
          [section]: nextList,
        };
      });
    },
    [updateMacros],
  );

  const removeMacro = useCallback(
    (section: SoapSection, macroIndex: number) => {
      updateMacros((current) => {
        if (macroIndex < 0 || macroIndex >= current[section].length) {
          return current;
        }

        return {
          ...current,
          [section]: current[section].filter((_, index) => index !== macroIndex),
        };
      });
    },
    [updateMacros],
  );

  const resetToDefaults = useCallback(() => {
    const defaults = getDefaultSoapMacros();
    setMacros(defaults);
    saveSoapMacros(defaults);
  }, []);

  return {
    macros,
    addMacro,
    removeMacro,
    resetToDefaults,
  };
}
