"use client";

import { useCallback, useState } from "react";
import {
  getDefaultScheduleSettings,
  loadScheduleSettings,
  saveScheduleSettings,
  type ScheduleSettingsConfig,
} from "@/lib/schedule-settings";

export function useScheduleSettings() {
  const [scheduleSettings, setScheduleSettings] = useState<ScheduleSettingsConfig>(() =>
    loadScheduleSettings(),
  );

  const updateSettings = useCallback(
    (updater: (current: ScheduleSettingsConfig) => ScheduleSettingsConfig) => {
      setScheduleSettings((current) => {
        const next = updater(current);
        saveScheduleSettings(next);
        return next;
      });
    },
    [],
  );

  const setEnforceOfficeHours = useCallback(
    (enabled: boolean) => {
      updateSettings((current) => ({
        ...current,
        enforceOfficeHours: enabled,
      }));
    },
    [updateSettings],
  );

  const setAllowOverride = useCallback(
    (enabled: boolean) => {
      updateSettings((current) => ({
        ...current,
        allowOverride: enabled,
      }));
    },
    [updateSettings],
  );

  const setAppointmentIntervalMin = useCallback(
    (minutes: number) => {
      updateSettings((current) => ({
        ...current,
        appointmentIntervalMin: Math.max(1, Math.round(minutes)),
      }));
    },
    [updateSettings],
  );

  const setMaxAppointmentsPerSlot = useCallback(
    (count: number) => {
      updateSettings((current) => ({
        ...current,
        maxAppointmentsPerSlot: Math.max(1, Math.round(count)),
      }));
    },
    [updateSettings],
  );

  const updateOfficeHour = useCallback(
    (
      dayOfWeek: number,
      updates: Partial<{
        enabled: boolean;
        start: string;
        end: string;
      }>,
    ) => {
      updateSettings((current) => ({
        ...current,
        officeHours: current.officeHours.map((officeHour) =>
          officeHour.dayOfWeek === dayOfWeek ? { ...officeHour, ...updates } : officeHour,
        ),
      }));
    },
    [updateSettings],
  );

  const resetToDefaults = useCallback(() => {
    const defaults = getDefaultScheduleSettings();
    setScheduleSettings(defaults);
    saveScheduleSettings(defaults);
  }, []);

  return {
    scheduleSettings,
    setEnforceOfficeHours,
    setAllowOverride,
    setAppointmentIntervalMin,
    setMaxAppointmentsPerSlot,
    updateOfficeHour,
    resetToDefaults,
  };
}
