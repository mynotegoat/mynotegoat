"use client";

import { useCallback, useMemo, useState } from "react";
import {
  loadPatientDiagnosesMap,
  savePatientDiagnosesMap,
  type PatientDiagnosisEntry,
} from "@/lib/patient-diagnoses";

function createEntry(code: string, description: string, source: string): PatientDiagnosisEntry {
  return {
    id: `pdx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    code: code.trim().toUpperCase(),
    description: description.trim(),
    source: source.trim() || "Manual",
    createdAt: new Date().toISOString(),
  };
}

export function usePatientDiagnoses(patientId: string) {
  const [diagnosisMap, setDiagnosisMap] = useState(() => loadPatientDiagnosesMap());

  const entries = useMemo(() => diagnosisMap[patientId] ?? [], [diagnosisMap, patientId]);

  const update = useCallback(
    (updater: (current: PatientDiagnosisEntry[]) => PatientDiagnosisEntry[]) => {
      setDiagnosisMap((currentMap) => {
        const nextPatientEntries = updater(currentMap[patientId] ?? []);
        const nextMap = {
          ...currentMap,
          [patientId]: nextPatientEntries,
        };
        savePatientDiagnosesMap(nextMap);
        return nextMap;
      });
    },
    [patientId],
  );

  const addDiagnosis = useCallback(
    (code: string, description: string, source = "Manual") => {
      const normalizedCode = code.trim().toUpperCase();
      const normalizedDescription = description.trim();
      if (!normalizedCode || !normalizedDescription) {
        return false;
      }

      let added = false;
      update((current) => {
        const duplicate = current.some(
          (entry) =>
            entry.code.toLowerCase() === normalizedCode.toLowerCase() &&
            entry.description.toLowerCase() === normalizedDescription.toLowerCase(),
        );
        if (duplicate) {
          return current;
        }
        added = true;
        return [...current, createEntry(normalizedCode, normalizedDescription, source)];
      });
      return added;
    },
    [update],
  );

  const addBulkDiagnoses = useCallback(
    (items: Array<{ code: string; description: string; source?: string }>) => {
      if (!items.length) {
        return 0;
      }
      let addedCount = 0;
      update((current) => {
        const next = [...current];
        items.forEach((item) => {
          const code = item.code.trim().toUpperCase();
          const description = item.description.trim();
          if (!code || !description) {
            return;
          }
          const duplicate = next.some(
            (entry) =>
              entry.code.toLowerCase() === code.toLowerCase() &&
              entry.description.toLowerCase() === description.toLowerCase(),
          );
          if (duplicate) {
            return;
          }
          addedCount += 1;
          next.push(createEntry(code, description, item.source ?? "Bundle"));
        });
        return next;
      });
      return addedCount;
    },
    [update],
  );

  const removeDiagnosis = useCallback(
    (id: string) => {
      update((current) => current.filter((entry) => entry.id !== id));
    },
    [update],
  );

  return {
    entries,
    addDiagnosis,
    addBulkDiagnoses,
    removeDiagnosis,
  };
}

