"use client";

import { useCallback, useState } from "react";
import {
  getDefaultOfficeSettings,
  loadOfficeSettings,
  saveOfficeSettings,
  type OfficeSettings,
} from "@/lib/office-settings";

export function useOfficeSettings() {
  const [officeSettings, setOfficeSettings] = useState<OfficeSettings>(() => loadOfficeSettings());

  const updateOfficeSettings = useCallback((patch: Partial<OfficeSettings>) => {
    setOfficeSettings((current) => {
      const next = { ...current, ...patch };
      saveOfficeSettings(next);
      return next;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    const defaults = getDefaultOfficeSettings();
    setOfficeSettings(defaults);
    saveOfficeSettings(defaults);
  }, []);

  return {
    officeSettings,
    updateOfficeSettings,
    resetToDefaults,
  };
}
