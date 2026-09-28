/**
 * Timer maths and formatting.
 *
 * Principle: never increment a timer. Elapsed time is always *derived* from a
 * timestamp difference, never counted, so the answer cannot depend on how often
 * the UI happened to repaint. A tick loop that is throttled to 1Hz in a
 * background tab, or suspended entirely by a hidden one, changes when the number
 * updates and nothing else.
 *
 * Two clocks, used on purpose:
 *
 *   - `performance.now()` is MONOTONIC. Immune to NTP corrections, DST,
 *     timezone changes, and a user nudging their system clock mid-session. This
 *     is what an open run segment is measured with.
 *   - `Date.now()` is WALL CLOCK, and is the only clock that survives a reload,
 *     because `performance.now()` restarts from zero on every navigation. This
 *     is what a segment is *checkpointed* with.
 *
 * The read path touches the monotonic clock and the write path touches the wall
 * clock exactly once, when a segment is checkpointed. That is what makes a
 * system clock change mid-session invisible: the open segment is already off the
 * wall clock by the time anything can move it.
 *
 * Every transition below is pure and takes `now` as an argument, so the whole
 * thing is testable with no browser, no fake timers, and no network.
 */

/** All durations in this module are MILLISECONDS, as `number`s. */
export type StopwatchStatus = "running" | "paused";

export interface StopwatchState {
  status: StopwatchStatus;
  /**
   * Monotonic ms at which the open segment began, or `null` while paused.
   * `status: "running"` with a `null` anchor is not a legal state; the parser
   * degrades it to paused rather than trusting it.
   */
  segmentStartedAt: number | null;
  /** Milliseconds banked from every segment that has already been closed. */
  accumulatedMs: number;
}

/**
 * The checkpointed form — what goes into `localStorage` and comes back after a
 * reload. The open segment is stored as a wall-clock instant because that is
 * the only value that still means something in a new document.
 */
export interface PersistedStopwatch {
  status: StopwatchStatus;
  accumulatedMs: number;
  /** Wall-clock epoch ms at which the open segment began, or `null` while paused. */
  segmentStartedAtEpochMs: number | null;
}

export function freshStopwatch(): StopwatchState {
  return { status: "paused", segmentStartedAt: null, accumulatedMs: 0 };
}

/** Opens a segment at `monotonicNow`. Idempotent while already running. */
export function startSegment(
  state: StopwatchState,
  monotonicNow: number
): StopwatchState {
  if (state.status === "running" && state.segmentStartedAt !== null) return state;
  return {
    status: "running",
    segmentStartedAt: monotonicNow,
    accumulatedMs: Math.max(0, state.accumulatedMs),
  };
}

/**
 * Closes the open segment at `monotonicNow`, banking its length into
 * `accumulatedMs`. Idempotent while already paused, so a double-click cannot
 * bank the same interval twice.
 */
export function pauseSegment(
  state: StopwatchState,
  monotonicNow: number
): StopwatchState {
  if (state.status !== "running" || state.segmentStartedAt === null) return state;
  return {
    status: "paused",
    segmentStartedAt: null,
    accumulatedMs:
      Math.max(0, state.accumulatedMs) +
      Math.max(0, monotonicNow - state.segmentStartedAt),
  };
}

/**
 * THE definition of elapsed time in this app. Identical at 4Hz, 60Hz, or once
 * an hour — a function of `now` and the anchors, never of how often it is
 * called.
 */
export function stopwatchElapsedMs(
  state: StopwatchState,
  monotonicNow: number
): number {
  if (state.status !== "running" || state.segmentStartedAt === null) {
    return Math.max(0, state.accumulatedMs);
  }
  return Math.max(0, state.accumulatedMs + (monotonicNow - state.segmentStartedAt));
}

/** True when the clock is still moving, i.e. a tick loop is worth running. */
export function isRunning(state: StopwatchState): boolean {
  return state.status === "running" && state.segmentStartedAt !== null;
}

/**
 * Checkpoints a live stopwatch against the wall clock. The inverse of
 * `restoreStopwatch`, and the only place `Date.now()` is allowed to influence
 * the running timer.
 */
export function serializeStopwatch(
  state: StopwatchState,
  monotonicNow: number,
  wallNow: number
): PersistedStopwatch {
  return {
    status: state.status,
    accumulatedMs: Math.max(0, state.accumulatedMs),
    segmentStartedAtEpochMs: isRunning(state)
      ? wallNow - (monotonicNow - state.segmentStartedAt!)
      : null,
  };
}

/**
 * Rebuilds a live stopwatch from a checkpoint in a *new* document.
 *
 * The wall clock is read exactly once, here, to work out how much focus was
 * banked while the tab was gone; the result is then folded into a fresh
 * monotonic anchor. Everything after this point is measured monotonically again,
 * so a system clock change during the session still cannot move the display.
 */
export function restoreStopwatch(
  persisted: PersistedStopwatch,
  wallNow: number,
  monotonicNow: number
): StopwatchState {
  const accumulatedMs = Math.max(0, persisted.accumulatedMs);

  if (persisted.status !== "running" || persisted.segmentStartedAtEpochMs === null) {
    return { status: "paused", segmentStartedAt: null, accumulatedMs };
  }

  const elapsed = accumulatedMs + (wallNow - persisted.segmentStartedAtEpochMs);
  return {
    status: "running",
    segmentStartedAt: monotonicNow - Math.max(0, elapsed),
    accumulatedMs: 0,
  };
}

/**
 * Validates a checkpoint read back from `localStorage`, which is user-writable
 * and may hold anything at all. Returns `null` for anything unrecognisable so
 * the caller falls back to the server rather than rendering a NaN timer.
 */
export function parsePersistedStopwatch(raw: unknown): PersistedStopwatch | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;

  const status = value.status;
  if (status !== "running" && status !== "paused") return null;

  const accumulatedMs = Number(value.accumulatedMs);
  if (!Number.isFinite(accumulatedMs) || accumulatedMs < 0) return null;

  const anchor = value.segmentStartedAtEpochMs;
  if (anchor === null || anchor === undefined) {
    // A "running" record with no anchor is corrupt. `restoreStopwatch` already
    // treats a missing anchor as paused, which is the safe reading.
    return { status, accumulatedMs, segmentStartedAtEpochMs: null };
  }

  const segmentStartedAtEpochMs = Number(anchor);
  if (!Number.isFinite(segmentStartedAtEpochMs)) return null;

  return { status, accumulatedMs, segmentStartedAtEpochMs };
}

/**
 * How far the user's clock may be from the server's before a client-supplied
 * start instant is ignored in favour of the server's own. A system clock an
 * hour out would otherwise file every session under a day that never happened.
 */
export const MAX_START_SKEW_SECONDS = 300;
const MAX_SESSION_AGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * Decides which start instant a new session row records.
 *
 * The client owns the clock the timer counts on, so it owns `startedAt` too — a
 * server-stamped origin compared against the browser's clock was exactly the bug
 * that made the timer begin late and stay permanently offset. Taking it from the
 * user is also the more consistent choice: "today" is already defined by the
 * *user's* midnight in `getDayRange`, so their clock is the one that agrees with
 * the grouping they expect.
 *
 * A value outside a plausible window falls back to the server's. This is a
 * sanity guard on a wrong system clock, not a trust boundary — there is nobody
 * to cheat here, and the user is the only party.
 */
export function resolveStartedAt(
  requested: number | undefined,
  serverNow: number
): number {
  if (requested === undefined) return serverNow;
  if (requested > serverNow + MAX_START_SKEW_SECONDS) return serverNow;
  if (requested < serverNow - MAX_SESSION_AGE_SECONDS) return serverNow;
  return requested;
}

/**
 * Formats duration in seconds to a human-friendly string (e.g., "1h 42m" or "52m").
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0s";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }
  return `${secs}s`;
}

/**
 * Formats seconds into a digital timer display string (HH:MM:SS).
 * e.g., 5076 -> "01:24:36"
 */
export function formatTimerDisplay(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}

/**
 * Formats a Unix timestamp (in seconds) to human readable local time (e.g., "10:20 AM").
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Categorizes a Unix timestamp into a date group (e.g., "Today", "Yesterday", "Monday", or formatted date).
 */
export function formatDateGroup(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";

  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
