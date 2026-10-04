/**
 * Month names, and the one date format that shows a day without its year.
 *
 * Two places needed this and had each written their own copy inside a component:
 * the heatmap's per-cell tooltips and the analytics range axis. Both are pure
 * string work on a `YYYY-MM-DD` key, so it lives here rather than in either view.
 */

/** Short month names, indexed 0-11 to match `Date#getUTCMonth`. */
export const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * `2026-03-04` → `Mar 4`.
 *
 * Reads the UTC parts of a UTC-midnight date, so it cannot shift a key across a
 * day boundary the way `new Date("2026-03-04")` would on a west-of-UTC machine.
 * Deliberately year-less: this labels a day inside a window the user is already
 * looking at, and a year on every one of sixty axis labels is noise.
 */
export function formatDayInMonth(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** `2026-03` → `Mar`. */
export function monthLabelOf(monthKey: string): string {
  return MONTH_LABELS[Number(monthKey.slice(5, 7)) - 1];
}