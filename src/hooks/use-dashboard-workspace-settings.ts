"use client";

import { useCallback, useState } from "react";
import {
  getDefaultDashboardWorkspaceSettings,
  loadDashboardWorkspaceSettings,
  saveDashboardWorkspaceSettings,
  type DashboardWorkspaceSettings,
  type MriAppearMode,
  type MriCtClearCondition,
  type SpecialistAppearWhen,
  type SpecialistClearCondition,
  type XrayClearCondition,
} from "@/lib/dashboard-workspace-settings";

export function useDashboardWorkspaceSettings() {
  const [dashboardWorkspaceSettings, setDashboardWorkspaceSettings] =
    useState<DashboardWorkspaceSettings>(() => loadDashboardWorkspaceSettings());

  const updateSettings = useCallback(
    (updater: (current: DashboardWorkspaceSettings) => DashboardWorkspaceSettings) => {
      setDashboardWorkspaceSettings((current) => {
        const next = updater(current);
        saveDashboardWorkspaceSettings(next);
        return next;
      });
    },
    [],
  );

  const setTasksShowOnDashboard = useCallback(
    (enabled: boolean) => {
      updateSettings((current) => ({
        ...current,
        myTasks: {
          ...current.myTasks,
          showOnDashboard: enabled,
        },
      }));
    },
    [updateSettings],
  );

  const setTasksOpenOnly = useCallback(
    (enabled: boolean) => {
      updateSettings((current) => ({
        ...current,
        myTasks: {
          ...current.myTasks,
          openOnly: enabled,
        },
      }));
    },
    [updateSettings],
  );

  const setTasksMaxItems = useCallback(
    (value: number) => {
      updateSettings((current) => ({
        ...current,
        myTasks: {
          ...current.myTasks,
          maxItems: Math.max(1, Math.min(25, Math.round(value || 1))),
        },
      }));
    },
    [updateSettings],
  );

  const setFollowUpShowOnDashboard = useCallback(
    (enabled: boolean) => {
      updateSettings((current) => ({
        ...current,
        patientFollowUp: {
          ...current.patientFollowUp,
          showOnDashboard: enabled,
        },
      }));
    },
    [updateSettings],
  );

  const setFollowUpIncludeXray = useCallback(
    (enabled: boolean) => {
      updateSettings((current) => ({
        ...current,
        patientFollowUp: {
          ...current.patientFollowUp,
          includeXray: enabled,
        },
      }));
    },
    [updateSettings],
  );

  const setFollowUpIncludeMriCt = useCallback(
    (enabled: boolean) => {
      updateSettings((current) => ({
        ...current,
        patientFollowUp: {
          ...current.patientFollowUp,
          includeMriCt: enabled,
        },
      }));
    },
    [updateSettings],
  );

  const setFollowUpIncludeSpecialist = useCallback(
    (enabled: boolean) => {
      updateSettings((current) => ({
        ...current,
        patientFollowUp: {
          ...current.patientFollowUp,
          includeSpecialist: enabled,
        },
      }));
    },
    [updateSettings],
  );

  const setFollowUpIncludeLienLop = useCallback(
    (enabled: boolean) => {
      updateSettings((current) => ({
        ...current,
        patientFollowUp: {
          ...current.patientFollowUp,
          includeLienLop: enabled,
        },
      }));
    },
    [updateSettings],
  );

  const setFollowUpStaleDaysThreshold = useCallback(
    (value: number) => {
      updateSettings((current) => ({
        ...current,
        patientFollowUp: {
          ...current.patientFollowUp,
          staleDaysThreshold: Math.max(1, Math.min(365, Math.round(value || 1))),
        },
      }));
    },
    [updateSettings],
  );

  const setFollowUpMaxItems = useCallback(
    (value: number) => {
      updateSettings((current) => ({
        ...current,
        patientFollowUp: {
          ...current.patientFollowUp,
          maxItems: Math.max(1, Math.min(50, Math.round(value || 1))),
        },
      }));
    },
    [updateSettings],
  );

  const resetToDefaults = useCallback(() => {
    const defaults = getDefaultDashboardWorkspaceSettings();
    setDashboardWorkspaceSettings(defaults);
    saveDashboardWorkspaceSettings(defaults);
  }, []);

  // --- Appear rules ---

  const setXrayAppearAuto = useCallback(
    (enabled: boolean) => {
      updateSettings((current) => ({
        ...current,
        patientFollowUp: {
          ...current.patientFollowUp,
          xrayAppearAuto: enabled,
        },
      }));
    },
    [updateSettings],
  );

  const setMriAppearMode = useCallback(
    (mode: MriAppearMode) => {
      updateSettings((current) => ({
        ...current,
        patientFollowUp: {
          ...current.patientFollowUp,
          mriAppearMode: mode,
        },
      }));
    },
    [updateSettings],
  );

  const setMriAppearDays = useCallback(
    (value: number) => {
      updateSettings((current) => ({
        ...current,
        patientFollowUp: {
          ...current.patientFollowUp,
          mriAppearDays: Math.max(1, Math.min(365, Math.round(value || 1))),
        },
      }));
    },
    [updateSettings],
  );

  const setSpecialistAppearWhen = useCallback(
    (value: SpecialistAppearWhen) => {
      updateSettings((current) => ({
        ...current,
        patientFollowUp: {
          ...current.patientFollowUp,
          specialistAppearWhen: value,
        },
      }));
    },
    [updateSettings],
  );

  // --- Cleared-by rules ---

  const toggleXrayClearedBy = useCallback(
    (condition: XrayClearCondition, enabled: boolean) => {
      updateSettings((current) => {
        const prev = current.patientFollowUp.xrayClearedBy;
        const next = enabled ? [...prev.filter((c) => c !== condition), condition] : prev.filter((c) => c !== condition);
        return {
          ...current,
          patientFollowUp: { ...current.patientFollowUp, xrayClearedBy: next },
        };
      });
    },
    [updateSettings],
  );

  const toggleMriCtClearedBy = useCallback(
    (condition: MriCtClearCondition, enabled: boolean) => {
      updateSettings((current) => {
        const prev = current.patientFollowUp.mriCtClearedBy;
        const next = enabled ? [...prev.filter((c) => c !== condition), condition] : prev.filter((c) => c !== condition);
        return {
          ...current,
          patientFollowUp: { ...current.patientFollowUp, mriCtClearedBy: next },
        };
      });
    },
    [updateSettings],
  );

  const toggleSpecialistClearedBy = useCallback(
    (condition: SpecialistClearCondition, enabled: boolean) => {
      updateSettings((current) => {
        const prev = current.patientFollowUp.specialistClearedBy;
        const next = enabled ? [...prev.filter((c) => c !== condition), condition] : prev.filter((c) => c !== condition);
        return {
          ...current,
          patientFollowUp: { ...current.patientFollowUp, specialistClearedBy: next },
        };
      });
    },
    [updateSettings],
  );

  const setXrayNoReportWarningDays = useCallback(
    (value: number) => {
      updateSettings((current) => ({
        ...current,
        patientFollowUp: {
          ...current.patientFollowUp,
          xrayNoReportWarningDays: Math.max(0, Math.min(365, Math.round(value || 0))),
        },
      }));
    },
    [updateSettings],
  );

  const setMriNoReportWarningDays = useCallback(
    (value: number) => {
      updateSettings((current) => ({
        ...current,
        patientFollowUp: {
          ...current.patientFollowUp,
          mriNoReportWarningDays: Math.max(0, Math.min(365, Math.round(value || 0))),
        },
      }));
    },
    [updateSettings],
  );

  const setSpecialistNoReportWarningDays = useCallback(
    (value: number) => {
      updateSettings((current) => ({
        ...current,
        patientFollowUp: {
          ...current.patientFollowUp,
          specialistNoReportWarningDays: Math.max(0, Math.min(365, Math.round(value || 0))),
        },
      }));
    },
    [updateSettings],
  );

  const setFollowUpLienLopClearStatuses = useCallback(
    (statuses: string[]) => {
      updateSettings((current) => ({
        ...current,
        patientFollowUp: {
          ...current.patientFollowUp,
          lienLopClearStatuses: statuses,
        },
      }));
    },
    [updateSettings],
  );

  return {
    dashboardWorkspaceSettings,
    setTasksShowOnDashboard,
    setTasksOpenOnly,
    setTasksMaxItems,
    setFollowUpShowOnDashboard,
    setFollowUpIncludeXray,
    setFollowUpIncludeMriCt,
    setFollowUpIncludeSpecialist,
    setFollowUpIncludeLienLop,
    setXrayAppearAuto,
    setMriAppearMode,
    setMriAppearDays,
    setSpecialistAppearWhen,
    toggleXrayClearedBy,
    toggleMriCtClearedBy,
    toggleSpecialistClearedBy,
    setXrayNoReportWarningDays,
    setMriNoReportWarningDays,
    setSpecialistNoReportWarningDays,
    setFollowUpLienLopClearStatuses,
    setFollowUpStaleDaysThreshold,
    setFollowUpMaxItems,
    resetToDefaults,
  };
}
