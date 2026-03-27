"use client";

import { useCallback, useState } from "react";
import {
  getDefaultPriorityCaseRules,
  loadPriorityCaseRules,
  savePriorityCaseRules,
  type PriorityCaseRules,
} from "@/lib/priority-cases";

export function usePriorityCaseRules() {
  const [priorityRules, setPriorityRules] = useState<PriorityCaseRules>(() =>
    loadPriorityCaseRules(),
  );

  const updateRules = useCallback((updater: (current: PriorityCaseRules) => PriorityCaseRules) => {
    setPriorityRules((current) => {
      const next = updater(current);
      savePriorityCaseRules(next);
      return next;
    });
  }, []);

  const toggleStatus = useCallback(
    (statusName: string) => {
      updateRules((current) => {
        const exists = current.statusNames.some(
          (name) => name.toLowerCase() === statusName.toLowerCase(),
        );
        return {
          ...current,
          statusNames: exists
            ? current.statusNames.filter(
                (name) => name.toLowerCase() !== statusName.toLowerCase(),
              )
            : [...current.statusNames, statusName],
        };
      });
    },
    [updateRules],
  );

  const setIncludeMriDue = useCallback(
    (enabled: boolean) => {
      updateRules((current) => ({
        ...current,
        includeMriDue: enabled,
      }));
    },
    [updateRules],
  );

  const setMriDueDaysFromInitial = useCallback(
    (days: number) => {
      updateRules((current) => ({
        ...current,
        mriDueDaysFromInitial: Math.max(1, Math.min(365, Math.round(days))),
      }));
    },
    [updateRules],
  );

  const setIncludeNoUpdate = useCallback(
    (enabled: boolean) => {
      updateRules((current) => ({
        ...current,
        includeNoUpdate: enabled,
      }));
    },
    [updateRules],
  );

  const setNoUpdateDaysThreshold = useCallback(
    (days: number) => {
      updateRules((current) => ({
        ...current,
        noUpdateDaysThreshold: Math.max(1, Math.min(365, Math.round(days))),
      }));
    },
    [updateRules],
  );

  const setIncludeRbStatusCheck = useCallback(
    (enabled: boolean) => {
      updateRules((current) => ({
        ...current,
        includeRbStatusCheck: enabled,
      }));
    },
    [updateRules],
  );

  const setRbStatusCheckDaysThreshold = useCallback(
    (days: number) => {
      updateRules((current) => ({
        ...current,
        rbStatusCheckDaysThreshold: Math.max(1, Math.min(365, Math.round(days))),
      }));
    },
    [updateRules],
  );

  const setMaxItems = useCallback(
    (value: number) => {
      updateRules((current) => ({
        ...current,
        maxItems: Math.max(1, Math.min(50, Math.round(value))),
      }));
    },
    [updateRules],
  );

  const resetToDefaults = useCallback(() => {
    const defaults = getDefaultPriorityCaseRules();
    setPriorityRules(defaults);
    savePriorityCaseRules(defaults);
  }, []);

  return {
    priorityRules,
    toggleStatus,
    setIncludeMriDue,
    setMriDueDaysFromInitial,
    setIncludeNoUpdate,
    setNoUpdateDaysThreshold,
    setIncludeRbStatusCheck,
    setRbStatusCheckDaysThreshold,
    setMaxItems,
    resetToDefaults,
  };
}
