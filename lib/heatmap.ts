/**
 * Heatmap colour scale.
 *
 * Pure — no React, no Tailwind import, no `window`. The thresholds are asserted
 * in `scripts/verify-e2e.ts` and the class strings are read by the component, so
 * neither side needs the other at runtime.
 *
 * The levels are fixed hour thresholds rather than quantiles of the user's own
 * distribution, which is the other common choice (GitHub uses quartiles). The
 * reason is the one failure mode that matters here: a single 14-hour day pulls
 * the top quartile up far enough that a solid 3-hour day collapses into the
 * bottom bucket, so a genuinely good day renders as barely-there. Absolute
 * thresholds cannot be distorted by one outlier, and a 3-hour day looks the same
 * today as it did last month.
 *
 * Level 0 is the absent swatch and is deliberately the plainest thing on the
 * card. A day with no sessions is a fact about the calendar, not a failure, and
 * the PRD is explicit that progress must never feel punitive (docs/PRD.md §14).
 */

/** Weeks shown, oldest first. A year reads as a year; 26 reads as a semester. */
export const HEATMAP_WEEKS = 52;

const HOUR = 3600;

export interface HeatmapLevel {
  /** 0 is the "no focus" swatch; 1-4 increase in intensity. */
  level: number;
  /** Spoken description, used in the grid's accessible name. */
  label: string;
  /**
   * Complete Tailwind class literals, never interpolated. Tailwind's scanner
   * reads the source, so a `` `bg-x-${i}` `` here would compile to a class that
   * does not exist in the stylesheet.
   */
  className: string;
  /** Legend copy. Empty for level 0, which the legend describes in prose. */
  legend: string;
}

export const HEATMAP_LEVELS: HeatmapLevel[] = [
  {
    level: 0,
    label: "No focus time recorded",
    className: "bg-muted/50 dark:bg-muted/40 border border-border/50",
    legend: "none",
  },
  {
    level: 1,
    label: "Under 1 hour",
    className: "bg-emerald-500/25 dark:bg-emerald-500/30",
    legend: "<1h",
  },
  {
    level: 2,
    label: "1 to 2 hours",
    className: "bg-emerald-500/50 dark:bg-emerald-500/55",
    legend: "1-2h",
  },
  {
    level: 3,
    label: "2 to 4 hours",
    className: "bg-emerald-500/75 dark:bg-emerald-500/80",
    legend: "2-4h",
  },
  {
    level: 4,
    label: "4 hours or more",
    className: "bg-emerald-500 dark:bg-emerald-400",
    legend: "4h+",
  },
];

/**
 * The swatch class for a duration. Safe for any input, including `NaN` and the
 * negatives a bad persisted value could produce — those fall to the absent
 * swatch rather than throwing or painting an intensity that means nothing.
 */
export function getHeatmapLevel(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  if (durationSeconds < HOUR) return 1;
  if (durationSeconds < 2 * HOUR) return 2;
  if (durationSeconds < 4 * HOUR) return 3;
  return 4;
}

/** `HEATMAP_LEVELS[i].className`, for the render path. */
export function getHeatmapSwatch(durationSeconds: number): string {
  return HEATMAP_LEVELS[getHeatmapLevel(durationSeconds)].className;
}
