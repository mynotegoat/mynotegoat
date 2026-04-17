"use client";

/**
 * Listener Leak Guard
 *
 * Root cause of the worst production incident we've had so far: a
 * useEffect with an unstable dep list stacked hundreds of
 * focus/visibilitychange listeners onto window/document. Every one of
 * them fired on every tab focus, spawning a cloud-retry chain, pegging
 * the CPU fan and eventually OOM-ing Chrome. By the time the user
 * noticed, their in-memory React state had been lost to the crash.
 *
 * This module intercepts `addEventListener` / `removeEventListener` on
 * window and document at module init, counts live listeners per event
 * type, and fires a loud visible alarm the moment any event crosses
 * the leak threshold. The goal isn't to prevent leaks after they start
 * — the goal is to make them instantly obvious to us in development
 * AND to the user in production so a runaway leak is NEVER again a
 * silent background process.
 *
 * The alarm dispatches a `casemate:listener-leak-detected` CustomEvent
 * that the portal layout catches and renders as a red sticky banner
 * with the offending event type and count. Users seeing it should
 * hard-refresh AND report the incident. We log a stack trace too so
 * we can trace the offending addEventListener call.
 */

const LEAK_THRESHOLDS: Record<string, number> = {
  // Events React's synthetic system attaches once per app — a few
  // legit mounts is normal. Above 25 is the leak pattern.
  focus: 25,
  blur: 25,
  visibilitychange: 25,
  resize: 25,
  scroll: 50, // scroll handlers are common; looser threshold
  keydown: 50,
  keyup: 50,
  mousemove: 50,
  // Custom internal events — way fewer legitimate registrations.
  "casemate:cloud-sync-blocked": 5,
};

// Anything not in the map above uses this fallback.
const DEFAULT_THRESHOLD = 100;

type Counts = Map<string, number>;

// Loose type for the overload-heavy addEventListener signature — we only
// care that the call is proxied through, not about typing full overloads.
type AddFn = (type: string, listener: unknown, options?: unknown) => void;

let installed = false;
let firedAlarms = new Set<string>();

function logLeak(target: "window" | "document", type: string, count: number) {
  const key = `${target}:${type}`;
  // Only fire once per (target,type) pair per page life so we don't
  // spam the console with the same alarm every keystroke.
  if (firedAlarms.has(key)) return;
  firedAlarms.add(key);

  const message =
    `[listener-leak-guard] ${target}.addEventListener("${type}", …) ` +
    `count reached ${count} — LEAK SUSPECTED. ` +
    `Hard-refresh the tab and check the useEffect that registers "${type}" ` +
    `for an unstable dep list or a mismatched remove-reference.`;

  // Loud and stacky so we can find the offending call site.
  console.error(message);
  console.trace("[listener-leak-guard] trace");

  // Let the portal layout render a visible banner. The banner is a
  // last-chance user warning — saves their work before the browser
  // tab starts to struggle.
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("casemate:listener-leak-detected", {
        detail: { target, type, count },
      }),
    );
  }
}

function thresholdFor(type: string): number {
  return LEAK_THRESHOLDS[type] ?? DEFAULT_THRESHOLD;
}

/** Reset for tests / forced checks. Not called in production. */
export function __resetLeakGuardForTests() {
  firedAlarms = new Set<string>();
}

/**
 * Install the global interceptor. Idempotent — calling twice is a
 * no-op. Safe to call from the portal layout mount.
 */
export function installListenerLeakGuard() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const windowCounts: Counts = new Map();
  const documentCounts: Counts = new Map();

  const originalWindowAdd = window.addEventListener.bind(window) as AddFn;
  const originalWindowRemove = window.removeEventListener.bind(window) as AddFn;
  const originalDocAdd = document.addEventListener.bind(document) as AddFn;
  const originalDocRemove = document.removeEventListener.bind(document) as AddFn;

  const wrap = (
    counts: Counts,
    originalAdd: AddFn,
    originalRemove: AddFn,
    targetName: "window" | "document",
  ) => {
    const add: AddFn = (type, listener, options) => {
      const next = (counts.get(type) ?? 0) + 1;
      counts.set(type, next);
      if (next >= thresholdFor(type)) {
        logLeak(targetName, type, next);
      }
      originalAdd(type, listener, options);
    };

    const remove: AddFn = (type, listener, options) => {
      const current = counts.get(type) ?? 0;
      // Don't decrement on every removeEventListener — browsers
      // silently no-op a remove that doesn't match, so we can't know
      // for sure whether a remove actually removed something. Instead
      // only decrement when the remove is reasonably expected to
      // succeed (i.e. there's at least 1 registered). This keeps the
      // counter from going negative and avoids false-healthy readings.
      if (current > 0) counts.set(type, current - 1);
      originalRemove(type, listener, options);
    };

    return { add, remove };
  };

  const win = wrap(windowCounts, originalWindowAdd, originalWindowRemove, "window");
  const doc = wrap(documentCounts, originalDocAdd, originalDocRemove, "document");

  // Reassign DOM methods — types are loose on purpose to avoid fighting
  // the browser's overload-heavy signatures.
  (window as unknown as { addEventListener: AddFn }).addEventListener = win.add;
  (window as unknown as { removeEventListener: AddFn }).removeEventListener = win.remove;
  (document as unknown as { addEventListener: AddFn }).addEventListener = doc.add;
  (document as unknown as { removeEventListener: AddFn }).removeEventListener = doc.remove;
}
