import * as React from "react";

/**
 * The daily focus goal, which is a per-device preference rather than session
 * data.
 *
 * It lives in `localStorage` because that is where it has always lived and
 * nothing about it needs to survive a device change — it is a target for the
 * hours ahead, not a record of the hours past. The bug this module fixes is
 * that the settings page wrote the key and the dashboard never read it, so the
 * goal the user set had no effect anywhere it was supposed to matter.
 *
 * Reads happen in an effect, never during render: `localStorage` does not exist
 * during SSR, and reading it while rendering would guarantee a hydration
 * mismatch. The first paint therefore shows the default and the stored value
 * lands a frame later, which is invisible in practice and correct by
 * construction.
 *
 * Client-only by usage — it uses React hooks and `window`. No "use client"
 * directive is needed because nothing server-side imports it.
 */

export const DAILY_GOAL_KEY = "ticktock_daily_goal_hours";
export const DEFAULT_DAILY_GOAL_HOURS = 4;
export const MIN_DAILY_GOAL_HOURS = 0.5;
export const MAX_DAILY_GOAL_HOURS = 24;

export function isValidDailyGoalHours(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= MIN_DAILY_GOAL_HOURS &&
    value <= MAX_DAILY_GOAL_HOURS
  );
}

/** Parses anything that arrived from an input or from storage. */
export function parseDailyGoalHours(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return isValidDailyGoalHours(parsed) ? parsed : null;
}

export function readDailyGoalHours(): number {
  if (typeof window === "undefined") return DEFAULT_DAILY_GOAL_HOURS;
  try {
    return (
      parseDailyGoalHours(window.localStorage.getItem(DAILY_GOAL_KEY)) ??
      DEFAULT_DAILY_GOAL_HOURS
    );
  } catch {
    // Private mode / storage disabled: the default goal is a working answer.
    return DEFAULT_DAILY_GOAL_HOURS;
  }
}

/** Returns false when the value is out of range or storage rejected the write. */
export function writeDailyGoalHours(hours: number): boolean {
  if (!isValidDailyGoalHours(hours)) return false;
  try {
    window.localStorage.setItem(DAILY_GOAL_KEY, String(hours));
    return true;
  } catch {
    return false;
  }
}

export interface DailyGoal {
  hours: number;
  /** Persists and applies the new goal. False when the value was rejected. */
  setHours: (hours: number) => boolean;
}

/**
 * The shared goal value, so the settings form and the dashboard progress bar
 * cannot drift apart again. A `storage` listener keeps two open tabs in step —
 * it fires only in the *other* tab, which is why `setHours` also updates local
 * state directly.
 */
export function useDailyGoalHours(): DailyGoal {
  const [hours, setStored] = React.useState(DEFAULT_DAILY_GOAL_HOURS);

  React.useEffect(() => {
    setStored(readDailyGoalHours());
  }, []);

  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === DAILY_GOAL_KEY) setStored(readDailyGoalHours());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setHours = React.useCallback((next: number) => {
    if (!writeDailyGoalHours(next)) return false;
    setStored(next);
    return true;
  }, []);

  return { hours, setHours };
}
