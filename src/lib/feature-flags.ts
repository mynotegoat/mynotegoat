"use client";

/**
 * Feature Flags
 *
 * Phase-0 of the cloud-as-truth migration. Every flag here defaults to FALSE
 * so Phase 0 ships zero user-visible behavior changes — the new code paths
 * exist but no entity is wired through them yet.
 *
 * Each subsequent phase flips ONE flag to true after its entity has been
 * verified end-to-end (read, write, realtime, multi-tab, sign-out wipe,
 * cross-account isolation). If a phase regresses, flip the flag back to
 * false and the app returns to legacy behavior with no code rollback.
 *
 * NEVER read these flags from inside a render-time branch that switches
 * between two storage shapes — always pick at module load. Toggling at
 * runtime would tear caches in half.
 */

export const cloudEntityFlags: Record<CloudEntityFlag, boolean> = {
  /** Phase 1: patients table-backed cloud entity. */
  patients: false,
  /** Phase 2: schedule appointments. */
  scheduleAppointments: false,
  /** Phase 3: encounter notes. */
  encounterNotes: false,
  /** Phase 4: patient billing, diagnoses, follow-up overrides. */
  billing: false,
  /** Phase 5: macros + templates. */
  macros: false,
  /** Phase 6: scheduling settings. */
  schedulingSettings: false,
  /** Phase 7: contacts. */
  contacts: false,
  /** Phase 8: tasks, dashboard, settings. */
  tasks: false,
};

export type CloudEntityFlag =
  | "patients"
  | "scheduleAppointments"
  | "encounterNotes"
  | "billing"
  | "macros"
  | "schedulingSettings"
  | "contacts"
  | "tasks";

export function isCloudEntityEnabled(flag: CloudEntityFlag): boolean {
  return cloudEntityFlags[flag] === true;
}
