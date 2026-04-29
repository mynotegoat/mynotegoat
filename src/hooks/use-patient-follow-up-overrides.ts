"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  const selfWriteCountRef = useRef(0);

  // Listen for changes made by other hook instances on this page
  useEffect(() => {
    return onLocalChange(SYNC_KEY, () => {
      if (selfWriteCountRef.current > 0) {
        selfWriteCountRef.current--;
        return;
      }
      setRecordsByPatientId(loadPatientFollowUpOverridesMap());
    });
  }, []);

  // Holds the in-flight cloud write so callers can await confirmation
  // for a single setter call. setState's updater runs synchronously
  // inside React's batch — we capture the promise via this ref instead
  // of returning it, so the existing fire-and-forget setters stay
  // backwards compatible.
  const lastCloudWriteRef = useRef<Promise<void>>(Promise.resolve());

  const updateMap = useCallback((updater: (current: PatientFollowUpOverrideMap) => PatientFollowUpOverrideMap) => {
    setRecordsByPatientId((current) => {
      const next = updater(current);
      // Capture the cloud-write promise so the awaitable variants
      // (setPatientRefusedAsync, etc.) can confirm the write landed
      // before the caller flips a "Saved" indicator.
      lastCloudWriteRef.current = savePatientFollowUpOverridesMap(next);
      selfWriteCountRef.current++;
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

  // Awaitable variants — perform the same setter then resolve only after
  // the cloud write confirms. Use these from UI flows that want to flip a
  // "Saving → Saved" pill so a silent cloud failure doesn't leave the
  // user thinking their toggle stuck when the next bootstrap will wipe
  // it. The non-async variants above remain for code paths that don't
  // need confirmation.
  const setPatientRefusedAsync = useCallback(
    async (patientId: string, category: FollowUpOverrideCategory, enabled: boolean) => {
      setCategoryFlags(patientId, category, { patientRefused: enabled });
      await lastCloudWriteRef.current;
    },
    [setCategoryFlags],
  );

  const setCompletedPriorCareAsync = useCallback(
    async (patientId: string, category: FollowUpOverrideCategory, enabled: boolean) => {
      setCategoryFlags(patientId, category, { completedPriorCare: enabled });
      await lastCloudWriteRef.current;
    },
    [setCategoryFlags],
  );

  const setNotNeededAsync = useCallback(
    async (patientId: string, category: FollowUpOverrideCategory, enabled: boolean) => {
      setCategoryFlags(patientId, category, { notNeeded: enabled });
      await lastCloudWriteRef.current;
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
    setPatientRefusedAsync,
    setCompletedPriorCareAsync,
    setNotNeededAsync,
    clearPatientOverrides,
  };
}
