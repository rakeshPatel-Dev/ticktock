import * as React from "react";
import { pauseAnchorSeconds, type StudySession } from "@/db/schema";
import {
  isRunning,
  parsePersistedStopwatch,
  pauseSegment,
  restoreStopwatch,
  serializeStopwatch,
  startSegment,
  stopwatchElapsedMs,
  type PersistedStopwatch,
  type StopwatchState,
} from "./timer";

/**
 * The running timer, and the reason it survives a reload.
 *
 * The clock lives here, not in the server. A study session is opened and closed
 * on the user's own machine, and the only thing the server needs from it is the
 * final number — so the server is told when a session *starts* (one insert, so
 * the one-active-session invariant is enforced up front) and when it *finishes*
 * (one update, carrying the duration). Pausing and resuming never touch the
 * network at all, which is also why there is nothing left to get out of step:
 * there is no optimistic copy of a server value to reconcile, and no pause anchor
 * that a round trip can arrive too late to fix.
 *
 * That leaves the two failure modes a timestamped client timer has to survive,
 * both handled here:
 *
 *   - A RELOAD. The open segment is checkpointed to `localStorage` against the
 *     wall clock on every transition, and restored against the monotonic clock
 *     on the way back in (`restoreStopwatch`). The tab being closed for a day
 *     costs nothing.
 *   - The RSC payload arriving mid-session. `revalidatePath` hands the timer a
 *     brand new `initialSession` object after every mutation, and the server has
 *     no idea the user paused. `seedFromServer` therefore refuses to overwrite a
 *     record it already has unless the server is pointing at a different row.
 *
 * Client-only by usage, like `lib/daily-goal.ts`: nothing server-side imports
 * it, and no `window` access happens at module scope.
 */

export const TIMER_STORAGE_KEY = "ticktock_active_session";

/** The slice of a session the running timer needs in order to render itself. */
export interface TrackedSession {
  id: string;
  subject: string;
  topic: string | null;
  goal: string | null;
  /**
   * Epoch SECONDS, taken from the user's own clock at the moment they pressed
   * start. Analytics bucket by `startedAt` in the *user's* timezone, so the
   * user's clock is the one that agrees with the grouping they expect.
   */
  startedAt: number;
}

interface TimerRecord {
  session: TrackedSession;
  stopwatch: StopwatchState;
  /** Banked milliseconds from closed pause intervals. */
  accumulatedPausedMs: number;
  /** Monotonic ms when the open pause segment began, or null while running. */
  pauseSegmentStartedAt: number | null;
}

interface PersistedRecord {
  version: 1;
  session: TrackedSession;
  stopwatch: PersistedStopwatch;
  accumulatedPausedMs: number;
  /** Wall-clock epoch ms when the open pause segment began, or null while running. */
  pauseSegmentStartedAtEpochMs: number | null;
}

export interface TimerSnapshot {
  session: TrackedSession | null;
  status: "idle" | "running" | "paused";
  /**
   * Whole seconds. The store republishes only when this value changes, so the
   * timer re-renders about once a second instead of once a frame — the display
   * is floored to whole seconds anyway, so every other frame would render an
   * identical string.
   */
  elapsedSeconds: number;
  /**
   * `false` until the first effect after hydration.
   *
   * The server cannot know this number. It depends on `performance.now()`, on
   * `localStorage`, and on whether the user paused — and since pausing is local
   * by design, the server has never heard about any of that. A server row reads
   * `active` for a session the user paused ten minutes ago, and computing
   * `now - startedAt` from it produces a confidently wrong figure: a page load
   * would render `00:00:58` and then settle on the true `00:00:36` once the
   * checkpoint was read, which is the jump-and-snap-back behaviour this rework
   * exists to remove.
   *
   * So until hydration the store reports nothing it could only be guessing at,
   * and the view renders a placeholder. Both the server and the first client
   * render see this same value, which is also what keeps hydration clean.
   */
  hydrated: boolean;
}

const IDLE_SNAPSHOT: TimerSnapshot = {
  session: null,
  status: "idle",
  elapsedSeconds: 0,
  hydrated: false,
};

/**
 * The single value both the server and the first client render return. A
 * constant, so `useSyncExternalStore` sees no change between them.
 */
const PENDING_SNAPSHOT: TimerSnapshot = IDLE_SNAPSHOT;

let record: TimerRecord | null = null;
let snapshot: TimerSnapshot = IDLE_SNAPSHOT;
let hydrated = false;
let rafId: number | null = null;
/**
 * Which row the last full reconcile was for, or `undefined` if there has not
 * been one. `revalidatePath` hands the timer a brand new `initialSession` object
 * after every mutation, so the effect that calls `reconcileFromServer` re-fires
 * constantly for a row that has not changed; without this the checkpoint would
 * be re-read and the monotonic anchor re-sealed on every one of them.
 */
let reconciledRemoteId: string | null | undefined = undefined;
const listeners = new Set<() => void>();

/* -------------------------------------------------------------------------- */
/* Clock and storage, isolated so the impure edges are visible                  */
/* -------------------------------------------------------------------------- */

const monotonicNow = (): number => performance.now();
const wallNow = (): number => Date.now();

function readPersisted(): PersistedRecord | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(TIMER_STORAGE_KEY);
  } catch {
    // Private mode / storage disabled.
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return normalizePersisted(parsed);
}

function normalizePersisted(value: unknown): PersistedRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const record_ = value as Record<string, unknown>;
  if (record_.version !== 1) return null;

  const session = record_.session;
  if (typeof session !== "object" || session === null) return null;
  const s = session as Record<string, unknown>;

  const id = s.id;
  const subject = s.subject;
  const startedAt = Number(s.startedAt);
  if (typeof id !== "string" || !id) return null;
  if (typeof subject !== "string" || !subject) return null;
  if (!Number.isFinite(startedAt)) return null;

  const stopwatch = parsePersistedStopwatch(record_.stopwatch);
  if (!stopwatch) return null;

  const rawAccumulatedPaused = Number(
    record_.accumulatedPausedMs ?? record_.pausedMs ?? 0
  );
  const rawPauseSegmentEpoch =
    record_.pauseSegmentStartedAtEpochMs === null ||
    record_.pauseSegmentStartedAtEpochMs === undefined
      ? null
      : Number(record_.pauseSegmentStartedAtEpochMs);

  if (
    rawPauseSegmentEpoch !== null &&
    !Number.isFinite(rawPauseSegmentEpoch)
  ) {
    return null;
  }

  return {
    version: 1,
    session: {
      id,
      subject,
      topic: typeof s.topic === "string" ? s.topic : null,
      goal: typeof s.goal === "string" ? s.goal : null,
      startedAt,
    },
    stopwatch,
    accumulatedPausedMs:
      Number.isFinite(rawAccumulatedPaused) && rawAccumulatedPaused > 0
        ? rawAccumulatedPaused
        : 0,
    pauseSegmentStartedAtEpochMs: rawPauseSegmentEpoch,
  };
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    if (!record) {
      window.localStorage.removeItem(TIMER_STORAGE_KEY);
      return;
    }
    const mono = monotonicNow();
    const wall = wallNow();
    const payload: PersistedRecord = {
      version: 1,
      session: record.session,
      stopwatch: serializeStopwatch(record.stopwatch, mono, wall),
      accumulatedPausedMs: record.accumulatedPausedMs,
      pauseSegmentStartedAtEpochMs:
        record.pauseSegmentStartedAt !== null
          ? wall - Math.max(0, mono - record.pauseSegmentStartedAt)
          : null,
    };
    window.localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota or private mode. The row is still on the server, so `reconcile`
    // rebuilds a coarse elapsed from `startedAt` on the next load rather than
    // losing the session.
  }
}

/* -------------------------------------------------------------------------- */
/* Publishing                                                                  */
/* -------------------------------------------------------------------------- */

function buildSnapshot(): TimerSnapshot {
  if (!record) return { ...IDLE_SNAPSHOT, hydrated };
  return {
    session: record.session,
    status: record.stopwatch.status,
    elapsedSeconds: Math.floor(
      stopwatchElapsedMs(record.stopwatch, monotonicNow()) / 1000
    ),
    hydrated,
  };
}

/**
 * Recomputes the snapshot and notifies subscribers, but only when something a
 * view can actually see has changed. The frame loop calls this 60 times a
 * second; a subscriber is woken about once.
 */
function publish() {
  const next = buildSnapshot();
  if (
    next.session === snapshot.session &&
    next.status === snapshot.status &&
    next.elapsedSeconds === snapshot.elapsedSeconds &&
    next.hydrated === snapshot.hydrated
  ) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) listener();
}

function ensureTicking() {
  if (rafId !== null) return;
  if (typeof requestAnimationFrame === "undefined") return;
  if (!record || !isRunning(record.stopwatch)) return;

  // `requestAnimationFrame` rather than `setInterval`. Browsers suspend it
  // entirely in a hidden tab, so a backgrounded session costs nothing instead of
  // waking up once a second, and the first frame after the tab is shown is
  // already correct because elapsed is recomputed from the anchor, never
  // decremented. `ensureTicking` re-checks the status each frame, so pausing
  // ends the loop without needing to cancel anything from the outside.
  rafId = requestAnimationFrame(() => {
    rafId = null;
    publish();
    ensureTicking();
  });
}

function stopTicking() {
  if (rafId === null) return;
  cancelAnimationFrame(rafId);
  rafId = null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) attachWindowListeners();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) detachWindowListeners();
  };
}

function attachWindowListeners() {
  if (typeof window === "undefined") return;
  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onVisibilityChange);
}

function detachWindowListeners() {
  if (typeof window === "undefined") return;
  window.removeEventListener("storage", onStorage);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("online", onOnline);
  window.removeEventListener("focus", onVisibilityChange);
  stopTicking();
}

/**
 * Elapsed is derived, so a tab waking from sleep has nothing to recalculate —
 * but the display *does* need republishing, because the frames that would have
 * carried the intervening seconds were never drawn.
 */
function onVisibilityChange() {
  publish();
  ensureTicking();
}

function onOnline() {
  publish();
  ensureTicking();
}

/**
 * Cross-tab. The `storage` event only fires in the *other* tab, which is
 * exactly the one that needs to hear about a pause. Best-effort by design: both
 * tabs anchor the same open segment to the same wall-clock instant, so they
 * agree to within a frame without talking to each other, and this listener only
 * has to cover the transitions — pause, resume, finish — where they would not.
 */
function onStorage(event: StorageEvent) {
  if (event.key !== TIMER_STORAGE_KEY) return;
  const persisted = readPersisted();
  if (!persisted) {
    record = null;
  } else {
    record = fromPersisted(persisted);
  }
  publish();
  ensureTicking();
}

/* -------------------------------------------------------------------------- */
/* Adopting a record                                                           */
/* -------------------------------------------------------------------------- */

function fromPersisted(persisted: PersistedRecord): TimerRecord {
  const wall = wallNow();
  const mono = monotonicNow();
  const stopwatch = restoreStopwatch(persisted.stopwatch, wall, mono);

  let accumulatedPausedMs = Math.max(0, persisted.accumulatedPausedMs);
  let pauseSegmentStartedAt: number | null = null;

  if (stopwatch.status === "paused") {
    // If it was paused when serialized, fold whatever time elapsed while away into
    // accumulatedPausedMs and reopen the pause segment at monotonicNow so subsequent
    // pause duration is measured monotonically.
    if (persisted.pauseSegmentStartedAtEpochMs !== null) {
      accumulatedPausedMs += Math.max(
        0,
        wall - persisted.pauseSegmentStartedAtEpochMs
      );
    }
    pauseSegmentStartedAt = mono;
  }

  return {
    session: persisted.session,
    stopwatch,
    accumulatedPausedMs,
    pauseSegmentStartedAt,
  };
}

function toTracked(session: StudySession): TrackedSession {
  return {
    id: session.id,
    subject: session.subject,
    topic: session.topic,
    goal: session.goal,
    startedAt: session.startedAt,
  };
}

/**
 * Rebuilds a record from a server row. This is the only path where the server's
 * idea of the elapsed time wins, and it is necessarily lossy about pauses for a
 * row that is `active` — the server has never been told. The best available
 * reconstruction of "active" is therefore "running since `startedAt`".
 *
 * A row that is still `paused` can only be a legacy one, written before the
 * client took over the clock, and `pauseAnchorSeconds` reads it correctly.
 */
function adoptFromServer(session: StudySession) {
  const wall = wallNow();
  const mono = monotonicNow();
  const anchor = pauseAnchorSeconds(session);
  const pausedBefore = Math.max(0, session.pausedSeconds) * 1000;
  const focusedMs = Math.max(
    0,
    ((anchor ?? wall / 1000) - session.startedAt) * 1000 - pausedBefore
  );

  const isPaused = anchor !== null;
  record = {
    session: toTracked(session),
    stopwatch:
      !isPaused
        ? {
            status: "running",
            segmentStartedAt: mono - focusedMs,
            accumulatedMs: 0,
          }
        : { status: "paused", segmentStartedAt: null, accumulatedMs: focusedMs },
    accumulatedPausedMs:
      pausedBefore + (isPaused ? Math.max(0, wall - anchor * 1000) : 0),
    pauseSegmentStartedAt: isPaused ? mono : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Server reconciliation                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Seeds the store from the server's view of the active session.
 *
 * Called from an effect, never during render: adopting a row publishes a
 * snapshot, and publishing during another component's render is a setState in
 * render. The view gates itself on `hydrated` until after this has run, so
 * nothing renders a half-seeded store.
 *
 * Deliberately reads no `localStorage`: that is `reconcileFromServer`'s job, and
 * it runs immediately afterwards.
 *
 * A no-op when the store already holds the same row — which is what keeps an RSC
 * revalidation from clobbering live pause state the server knows nothing about.
 */
export function seedFromServer(session: StudySession | null): void {
  if (record) {
    if (session && session.id !== record.session.id) {
      adoptFromServer(session);
      publish();
    }
    return;
  }
  if (session) {
    adoptFromServer(session);
    publish();
  }
}

/**
 * Reconciles the store with the server, in an effect, once `localStorage` is
 * available. Three cases, and the order matters:
 *
 *   1. A checkpoint exists for the row the server has: it wins, because it holds
 *      the pause state the server was never told about.
 *   2. The server's row is gone — finished in another tab, deleted, or wiped by
 *      "Reset data" — so the local record is dropped. This is the case that used
 *      to leave a timer counting against a deleted row.
 *   3. The server has a row we have never seen: adopt it.
 */
/**
 * Whether a reconcile can be skipped.
 *
 * The fast path exists to stop a revalidation from re-reading `localStorage` and
 * re-sealing the monotonic anchor on every RSC refresh. It is only safe when the
 * remote row is the one already reconciled *and* there is nothing local that the
 * server is not describing.
 *
 * The second clause is not belt-and-braces. Skipping on `reconciledRemoteId ===
 * remoteId` alone is wrong in a very ordinary sequence:
 *
 *   1. Load the dashboard with nothing active, so the first reconcile runs and
 *      sets `reconciledRemoteId` to `null`.
 *   2. Start a session. `startFromServer` takes ownership of a row, but the
 *      server has not re-rendered yet, so `reconciledRemoteId` is still `null`.
 *   3. Delete that session, or finish it in another tab.
 *   4. Reconcile runs with `remoteId === null` — equal to the stale
 *      `reconciledRemoteId`, so the fast path fired, and the local record for a
 *      row that no longer exists was never dropped.
 *
 * The result was a timer counting against a deleted session with no way to clear
 * it, and the "Ready to focus?" hero never coming back without a full page
 * reload.
 */
export function canSkipReconcile(
  reconciledId: string | null | undefined,
  remoteId: string | null,
  hasLocalRecord: boolean
): boolean {
  if (reconciledId !== remoteId) return false;
  // `null` is ambiguous: it means "the server has no open session", which is both
  // the steady state and the state that has to reconcile a local record away.
  if (remoteId === null && hasLocalRecord) return false;
  return true;
}

export function reconcileFromServer(session: StudySession | null): void {
  const remoteId = session ? session.id : null;

  if (canSkipReconcile(reconciledRemoteId, remoteId, record !== null)) {
    ensureTicking();
    return;
  }
  reconciledRemoteId = remoteId;

  const before = record;
  const persisted = readPersisted();

  if (persisted && (!record || record.session.id === persisted.session.id)) {
    record = fromPersisted(persisted);
  }

  if (record && (!session || session.id !== record.session.id)) {
    if (session) {
      adoptFromServer(session);
    } else {
      record = null;
    }
  } else if (!record && session) {
    adoptFromServer(session);
  }

  if (record !== before) persist();
  ensureTicking();
  publish();
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Takes ownership of a freshly created session. Called as soon as `createSession`
 * resolves, so the timer appears on the click rather than a round trip later.
 */
export function startFromServer(session: StudySession): void {
  const mono = monotonicNow();
  // Account for any network round-trip transit time between the user clicking
  // Start (session.startedAt) and this response arriving back at the client.
  const elapsedTransitMs = Math.max(0, wallNow() - session.startedAt * 1000);
  const stopwatch = {
    status: "running" as const,
    segmentStartedAt: mono - elapsedTransitMs,
    accumulatedMs: 0,
  };
  record = {
    session: toTracked(session),
    stopwatch,
    accumulatedPausedMs: 0,
    pauseSegmentStartedAt: null,
  };
  // The server has just named this row, so the next revalidation describing it
  // is describing what we already hold. Recording it here also means a
  // reconcile that arrives before the revalidation does not re-read the
  // checkpoint for a session that has not been written yet.
  reconciledRemoteId = session.id;
  persist();
  ensureTicking();
  publish();
}

/** Purely local. No request, no optimistic copy of a server value to reconcile. */
export function pause(): void {
  if (!record || !isRunning(record.stopwatch)) return;
  const mono = monotonicNow();

  record = {
    ...record,
    stopwatch: pauseSegment(record.stopwatch, mono),
    pauseSegmentStartedAt: mono,
  };
  persist();
  publish();
}

/** Purely local. No request. */
export function resume(): void {
  if (!record || isRunning(record.stopwatch)) return;
  const mono = monotonicNow();
  const currentPauseMs =
    record.pauseSegmentStartedAt !== null
      ? Math.max(0, mono - record.pauseSegmentStartedAt)
      : 0;

  record = {
    ...record,
    stopwatch: startSegment(record.stopwatch, mono),
    accumulatedPausedMs: record.accumulatedPausedMs + currentPauseMs,
    pauseSegmentStartedAt: null,
  };
  persist();
  ensureTicking();
  publish();
}

/** The numbers to record when the session is saved. */
export interface FinalTotals {
  durationSeconds: number;
  pausedSeconds: number;
}

/**
 * The numbers to record when the session is saved. Floored, so what gets stored
 * is exactly the number the user was looking at.
 */
export function readFinalTotals(): FinalTotals {
  if (!record) return { durationSeconds: 0, pausedSeconds: 0 };
  const mono = monotonicNow();
  const durationSeconds = Math.floor(
    stopwatchElapsedMs(record.stopwatch, mono) / 1000
  );

  const currentPauseMs =
    record.pauseSegmentStartedAt !== null
      ? Math.max(0, mono - record.pauseSegmentStartedAt)
      : 0;
  const totalPausedMs = record.accumulatedPausedMs + currentPauseMs;
  const pausedSeconds = Math.floor(totalPausedMs / 1000);

  return {
    durationSeconds,
    pausedSeconds,
  };
}

export function clear(): void {
  record = null;
  persist();
  publish();
}

/* -------------------------------------------------------------------------- */
/* React binding                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Flips the store out of the "cannot know yet" state.
 *
 * Called from an effect, so it necessarily runs *after* hydration has already
 * succeeded against the pending snapshot. That ordering is the whole trick: the
 * server render and the hydration render both saw `PENDING_SNAPSHOT`, React is
 * already satisfied, and this merely schedules the second render that shows the
 * real figure.
 */
function markHydrated(): void {
  if (hydrated) return;
  hydrated = true;
  publish();
}

/**
 * The server's view. Deliberately not `getSnapshot`: the server has no
 * `performance.now`, no `localStorage`, and no knowledge of the pause, so
 * handing it the live snapshot would render a number nothing can stand behind.
 */
function getServerSnapshot(): TimerSnapshot {
  return PENDING_SNAPSHOT;
}

/**
 * The client's view. Returns the pending snapshot until `markHydrated` runs, so
 * the first client render matches the server byte for byte.
 */
function getClientSnapshot(): TimerSnapshot {
  return hydrated ? snapshot : PENDING_SNAPSHOT;
}

/**
 * Subscribes to the store.
 *
 * `getServerSnapshot` and `getClientSnapshot` are deliberately different
 * functions. They previously shared one, on the reasoning that seeding the store
 * during render would make both sides agree — which is only true for a session
 * that was never paused, and only until `reconcileFromServer` reads the
 * checkpoint and corrects it. A paused session therefore rendered one number on
 * the server and a different one on the client, and React threw the tree away
 * and rebuilt it.
 */
export function useTimerSnapshot(): TimerSnapshot {
  const value = React.useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot
  );
  React.useEffect(markHydrated, []);
  return value;
}
