/**
 * The heatmap colour scale.
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
 * The ramp is a single hue at rising intensity. This is one sequential measure —
 * focus time — so it is one hue; a second hue here would imply a second variable
 * that does not exist. It was green, which collided with the "running" state
 * colour; it is now the app accent, so the only saturated colour in the
 * interface means the timer is live.
 *
 * Level 0 is the absent swatch, and it is the one that had to be rethought when
 * the surfaces gained depth. It used to be `bg-muted/70`, on the assumption that
 * a nearly-invisible cell was the quietest possible answer — but the card is
 * white and `--muted` is itself a near-white, so at 70% alpha it landed within a
 * point or two of the card behind it and the whole grid read as an empty panel.
 * Level 0 is now full-strength `--muted`, no alpha: still the quietest thing on
 * the card, and now actually a cell. A day with no sessions is a fact about the
 * calendar, not a failure, and the PRD is explicit that progress must never feel
 * punitive (docs/PRD.md §14) — which is a reason for it to be neutral, not a
 * reason for it to be invisible.
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
    className: "bg-muted",
    legend: "none",
  },
  {
    level: 1,
    label: "Under 1 hour",
    className: "bg-primary/20",
    legend: "<1h",
  },
  {
    level: 2,
    label: "1 to 2 hours",
    className: "bg-primary/40",
    legend: "1-2h",
  },
  {
    level: 3,
    label: "2 to 4 hours",
    className: "bg-primary/65",
    legend: "2-4h",
  },
  {
    level: 4,
    label: "4 hours or more",
    className: "bg-primary",
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
