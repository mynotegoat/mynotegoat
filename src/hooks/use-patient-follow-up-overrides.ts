"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createPatientFollowUpOverrideRecord,
  hasAnyFollowUpOverrideFlags,
  loadPatientFollowUpOverridesMap,
  savePatientFollowUpOverridesMap,
  type FollowUpCategoryOverrideFlags,
  type FollowUpOverrideCategory,
  type PatientFollowUpOverrideMap,
  type PatientFollowUpOverrideRecord,
} from "@/lib/patient-follow-up-overrides";
import { notifyChange, onLocalChange } from "@/lib/local-sync";

const SYNC_KEY = "casemate.patient-follow-up-overrides.v1";

type FollowUpOverrideCategoryPatch = Partial<FollowUpCategoryOverrideFlags>;

function nowIso() {
  return new Date().toISOString();
}

export function usePatientFollowUpOverrides() {
  const [recordsByPatientId, setRecordsByPatientId] = useState<PatientFollowUpOverrideMap>(() =>
    loadPatientFollowUpOverridesMap(),
  );

  // Listen for changes made by other hook instances on this page
  useEffect(() => {
    return onLocalChange(SYNC_KEY, () => {
      setRecordsByPatientId(loadPatientFollowUpOverridesMap());
    });
  }, []);

  const updateMap = useCallback((updater: (current: PatientFollowUpOverrideMap) => PatientFollowUpOverrideMap) => {
    setRecordsByPatientId((current) => {
      const next = updater(current);
      savePatientFollowUpOverridesMap(next);
      notifyChange(SYNC_KEY);
      return next;
    });
  }, []);

  const getRecord = useCallback(
    (patientId: string): PatientFollowUpOverrideRecord => {
      const normalizedPatientId = patientId.trim();
      if (!normalizedPatientId) {
        return createPatientFollowUpOverrideRecord("");
      }
      return recordsByPatientId[normalizedPatientId] ?? createPatientFollowUpOverrideRecord(normalizedPatientId);
    },
    [recordsByPatientId],
  );

  const setCategoryFlags = useCallback(
    (patientId: string, category: FollowUpOverrideCategory, patch: FollowUpOverrideCategoryPatch) => {
      const normalizedPatientId = patientId.trim();
      if (!normalizedPatientId) {
        return;
      }
      updateMap((current) => {
        const base = current[normalizedPatientId] ?? createPatientFollowUpOverrideRecord(normalizedPatientId);
        const nextCategory: FollowUpCategoryOverrideFlags = {
          patientRefused:
            patch.patientRefused === undefined ? base[category].patientRefused : Boolean(patch.patientRefused),
          completedPriorCare:
            patch.completedPriorCare === undefined
              ? base[category].completedPriorCare
              : Boolean(patch.completedPriorCare),
          notNeeded:
            patch.notNeeded === undefined ? base[category].notNeeded : Boolean(patch.notNeeded),
        };
        const nextRecord: PatientFollowUpOverrideRecord = {
          ...base,
          [category]: nextCategory,
          updatedAt: nowIso(),
        };

        if (!hasAnyFollowUpOverrideFlags(nextRecord)) {
          if (!current[normalizedPatientId]) {
            return current;
          }
          const next = { ...current };
          delete next[normalizedPatientId];
          return next;
        }

        return {
          ...current,
          [normalizedPatientId]: nextRecord,
        };
      });
    },
    [updateMap],
  );

  const setPatientRefused = useCallback(
    (patientId: string, category: FollowUpOverrideCategory, enabled: boolean) => {
      setCategoryFlags(patientId, category, { patientRefused: enabled });
    },
    [setCategoryFlags],
  );

  const setCompletedPriorCare = useCallback(
    (patientId: string, category: FollowUpOverrideCategory, enabled: boolean) => {
      setCategoryFlags(patientId, category, { completedPriorCare: enabled });
    },
    [setCategoryFlags],
  );

  const setNotNeeded = useCallback(
    (patientId: string, category: FollowUpOverrideCategory, enabled: boolean) => {
      setCategoryFlags(patientId, category, { notNeeded: enabled });
    },
    [setCategoryFlags],
  );

  const clearPatientOverrides = useCallback(
    (patientId: string) => {
      const normalizedPatientId = patientId.trim();
      if (!normalizedPatientId) {
        return;
      }
      updateMap((current) => {
        if (!current[normalizedPatientId]) {
          return current;
        }
        const next = { ...current };
        delete next[normalizedPatientId];
        return next;
      });
    },
    [updateMap],
  );

  return {
    recordsByPatientId,
    getRecord,
    setCategoryFlags,
    setPatientRefused,
    setCompletedPriorCare,
    setNotNeeded,
    clearPatientOverrides,
  };
}
