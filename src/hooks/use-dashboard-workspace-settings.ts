"use client";

import { useCallback, useState } from "react";
import {
  getDefaultDashboardWorkspaceSettings,
  loadDashboardWorkspaceSettings,
  saveDashboardWorkspaceSettings,
  type FollowUpImagingClearStage,
  type FollowUpSpecialistClearStage,
  type DashboardWorkspaceSettings,
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

  const setFollowUpXrayClearWhen = useCallback(
    (value: FollowUpImagingClearStage) => {
      updateSettings((current) => ({
        ...current,
        patientFollowUp: {
          ...current.patientFollowUp,
          xrayClearWhen: value,
        },
      }));
    },
    [updateSettings],
  );

  const setFollowUpMriCtClearWhen = useCallback(
    (value: FollowUpImagingClearStage) => {
      updateSettings((current) => ({
        ...current,
        patientFollowUp: {
          ...current.patientFollowUp,
          mriCtClearWhen: value,
        },
      }));
    },
    [updateSettings],
  );

  const setFollowUpSpecialistClearWhen = useCallback(
    (value: FollowUpSpecialistClearStage) => {
      updateSettings((current) => ({
        ...current,
        patientFollowUp: {
          ...current.patientFollowUp,
          specialistClearWhen: value,
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
    setFollowUpXrayClearWhen,
    setFollowUpMriCtClearWhen,
    setFollowUpSpecialistClearWhen,
    setFollowUpLienLopClearStatuses,
    setFollowUpStaleDaysThreshold,
    setFollowUpMaxItems,
    resetToDefaults,
  };
}
