"use client";

import { useCallback, useState } from "react";
import {
  getDefaultQuickStatsSettings,
  loadQuickStatsSettings,
  saveQuickStatsSettings,
  type QuickStatOptionKey,
  type QuickStatsSettings,
} from "@/lib/quick-stats-settings";

export function useQuickStatsSettings() {
  const [quickStatsSettings, setQuickStatsSettings] = useState<QuickStatsSettings>(() =>
    loadQuickStatsSettings(),
  );

  const updateSettings = useCallback(
    (updater: (current: QuickStatsSettings) => QuickStatsSettings) => {
      setQuickStatsSettings((current) => {
        const next = updater(current);
        saveQuickStatsSettings(next);
        return next;
      });
    },
    [],
  );

  const setStatVisibility = useCallback(
    (key: QuickStatOptionKey, visible: boolean) => {
      updateSettings((current) => ({
        ...current,
        visibleStats: {
          ...current.visibleStats,
          [key]: visible,
        },
      }));
    },
    [updateSettings],
  );

  const setAllStatsVisible = useCallback(
    (visible: boolean) => {
      updateSettings((current) => ({
        ...current,
        visibleStats: {
          checkedInOut: visible,
          noShow: visible,
          canceled: visible,
          openEncounters: visible,
          closedEncounters: visible,
          currentBill: visible,
        },
      }));
    },
    [updateSettings],
  );

  const resetToDefaults = useCallback(() => {
    const defaults = getDefaultQuickStatsSettings();
    setQuickStatsSettings(defaults);
    saveQuickStatsSettings(defaults);
  }, []);

  return {
    quickStatsSettings,
    setStatVisibility,
    setAllStatsVisible,
    resetToDefaults,
  };
}
