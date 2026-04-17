"use client";

/**
 * Draft Recovery Banner
 *
 * On app load, scans localStorage for per-encounter-section draft keys
 * that the crash-safe editor layer (`src/lib/draft-recovery.ts`) writes
 * on EVERY keystroke. If any draft doesn't match the committed
 * encounter content, we surface a recovery prompt at the top of the
 * screen so the user can:
 *   - Restore the draft into the encounter (takes them straight to
 *     the affected SOAP section with the draft HTML pre-filled), OR
 *   - Dismiss if they already did the recovery elsewhere / don't want
 *     the draft
 *
 * The banner is deliberately persistent (can't be closed by clicking
 * outside) to prevent a panicking user from accidentally losing the
 * only remaining copy of their work.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  loadEncounterNoteRecords,
  saveEncounterNoteRecords,
} from "@/lib/encounter-notes";
import { clearDraft, scanDrafts, type DraftEntry } from "@/lib/draft-recovery";

function formatAge(at: number): string {
  const diff = Date.now() - at;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

type PendingDraft = DraftEntry & {
  encounterLabel: string | null;
  committedHtml: string;
};

export function DraftRecoveryBanner() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingDraft[]>([]);
  const [dismissed, setDismissed] = useState(false);

  // One-shot scan on mount. Reading localStorage + setting state once
  // is exactly what this effect is for — the lint rule is correct in
  // general but wrong here (this isn't a cascade, it's bootstrapping
  // state from a side-channel data source).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const drafts = scanDrafts();
    if (drafts.length === 0) return;
    // Cross-reference with the committed encounter records. A draft
    // only gets surfaced if its content DIFFERS from the committed
    // copy — otherwise it's already saved and we shouldn't alarm the
    // user unnecessarily.
    const encounters = loadEncounterNoteRecords();
    const byId = new Map(encounters.map((e) => [e.id, e]));
    const pend: PendingDraft[] = [];
    for (const draft of drafts) {
      const encounter = byId.get(draft.encounterId);
      const committed =
        encounter &&
        typeof encounter.soap === "object" &&
        draft.section in encounter.soap
          ? (encounter.soap as Record<string, string>)[draft.section]
          : "";
      // Content matches committed → already saved, clear the draft
      // and move on.
      if (committed === draft.html) {
        clearDraft(draft.key);
        continue;
      }
      // Empty drafts with no committed content are noise.
      if (!draft.html.trim() && !committed.trim()) {
        clearDraft(draft.key);
        continue;
      }
      pend.push({
        ...draft,
        encounterLabel: encounter
          ? `${encounter.patientName} — ${encounter.encounterDate}`
          : null,
        committedHtml: committed,
      });
    }
    setPending(pend);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const visibleDrafts = useMemo(() => pending.slice(0, 5), [pending]);

  if (dismissed || pending.length === 0) return null;

  const handleRestoreAll = () => {
    // For each pending draft, overwrite the committed encounter with
    // the draft content. We go through loadEncounterNoteRecords →
    // saveEncounterNoteRecords so the cloud dual-write fires too.
    const encounters = loadEncounterNoteRecords();
    const byId = new Map(encounters.map((e) => [e.id, { ...e, soap: { ...e.soap } }]));
    for (const draft of pending) {
      const target = byId.get(draft.encounterId);
      if (!target) continue;
      (target.soap as Record<string, string>)[draft.section] = draft.html;
      target.updatedAt = new Date().toISOString();
    }
    const next = Array.from(byId.values());
    saveEncounterNoteRecords(next);
    // Drafts are cleared by saveEncounterNoteRecords's commit-sync,
    // but belt-and-suspenders here too.
    for (const draft of pending) clearDraft(draft.key);
    setDismissed(true);
    // Reload so every open React tree picks up the restored state.
    router.refresh();
  };

  const handleDismissAll = () => {
    const confirmed = window.confirm(
      `You have ${pending.length} unsaved draft(s) from a prior session.\n\n` +
        "Dismissing will PERMANENTLY delete these drafts without restoring them.\n\n" +
        "Are you absolutely sure?",
    );
    if (!confirmed) return;
    for (const draft of pending) clearDraft(draft.key);
    setDismissed(true);
  };

  return (
    <div className="fixed inset-x-0 top-0 z-[70] bg-amber-500 px-4 py-3 text-sm font-semibold text-amber-950 shadow-lg">
      <div className="mx-auto flex max-w-4xl flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            ⚠ Unsaved work recovered — {pending.length} draft{pending.length === 1 ? "" : "s"} from
            a previous session
          </span>
          <div className="flex items-center gap-2">
            <button
              className="rounded-md bg-amber-950 px-3 py-1 text-xs font-semibold text-amber-50 hover:bg-amber-900"
              onClick={handleRestoreAll}
              type="button"
            >
              Restore all
            </button>
            <button
              className="rounded-md border border-amber-950/40 bg-amber-400/40 px-3 py-1 text-xs font-semibold text-amber-950 hover:bg-amber-400/60"
              onClick={handleDismissAll}
              type="button"
            >
              Delete all drafts
            </button>
          </div>
        </div>
        <ul className="max-h-48 overflow-y-auto space-y-1 border-t border-amber-950/30 pt-2 text-xs font-normal">
          {visibleDrafts.map((draft) => (
            <li key={draft.key} className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold">
                  {draft.encounterLabel ?? `Encounter ${draft.encounterId}`}
                </span>
                <span className="ml-1 rounded bg-amber-950/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  {draft.section}
                </span>
                <span className="ml-2 text-amber-950/70">{formatAge(draft.at)}</span>
              </span>
            </li>
          ))}
          {pending.length > visibleDrafts.length && (
            <li className="text-[10px] italic text-amber-950/70">
              …and {pending.length - visibleDrafts.length} more
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
