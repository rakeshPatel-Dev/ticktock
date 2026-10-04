/**
 * What window the analytics page is describing, and the bars that window draws.
 *
 * The page used to be hard-wired to "this week" in four places at once — the
 * range handed to three aggregations, the seven labels under the chart, and the
 * word "week" in three strings of copy. Widening it to four ranges means that
 * decision has to be made in exactly one place, and it is this file.
 *
 * The shape of the answer follows from what a bar chart can honestly show. A bar
 * is labelled, and a label needs room, so the unit a bar represents is chosen to
 * keep the bar count in single figures however wide the window gets:
 *
 *   week  → 7 bars, one per day      (Sun–Sat, as `getWeekRange` defines it)
 *   month → 4-5 bars, one per week   (the week columns the month touches)
 *   year  → 12 bars, one per month
 *   all   → one per month, for as many months as there is history
 *
 * Thirty hair-thin bars with a label every fifth is not a better month view; it
 * is a month view nobody can read on a phone, and it is worse than the week view
 * for the question it is supposed to answer.
 *
 * One query serves all four. Mongo buckets by calendar day in the user's zone —
 * the shape `getHeatmapAnalytics` already used — and `foldDaysIntoBars` collapses
 * days into whatever unit the chosen range wants. Bucketing per unit instead would
 * mean four aggregation shapes whose bucket keys each have to agree with a
 * different set of range bounds, which is the class of bug `lib/timezone.ts`
 * exists to make impossible.
 */

import { formatDayInMonth, MONTH_LABELS, monthLabelOf } from "@/lib/months";
import {
  formatDateInZone,
  getCalendarRange,
  getDayRange,
  getWeekRange,
  monthKeyOf,
  SERVER_TIME_ZONE,
  shiftDateKey,
  shiftMonthKey,
} from "@/lib/timezone";

/** The windows the page offers, in the order they are offered. */
export const ANALYTICS_RANGES = ["week", "month", "year", "all"] as const;

export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

/** The default is the current week — the window the page shipped with. */
export const DEFAULT_ANALYTICS_RANGE: AnalyticsRange = "week";

/** Short control labels. Distinct from `label`, which is the prose phrase. */
export const RANGE_CONTROL_LABELS: Record<AnalyticsRange, string> = {
  week: "Week",
  month: "Month",
  year: "Year",
  all: "All time",
};

/**
 * Every string that names a range in prose, in one place.
 *
 * The page repeats the window's name in six sentences, and "All time" is the one
 * that does not survive naive interpolation — "Nothing tracked all time yet" is
 * not English, and "Your longest topics all time." is worse. So each range
 * carries the sentences it needs rather than being assembled from its label at
 * the call site, where the awkward case would have to be special-cased once per
 * string.
 */
export const RANGE_PROSE: Record<
  AnalyticsRange,
  { /** Tile label and the head of a sentence. "This week" / "All time". */
    label: string;
    /** Fits after "Nothing tracked". "this week" / "yet". */
    tracked: string;
    /** Fits after "Your longest topics". "this week" / "all time". */
    of: string;
  }
> = {
  week: { label: "This week", tracked: "this week yet", of: "this week" },
  month: { label: "This month", tracked: "this month yet", of: "this month" },
  year: { label: "This year", tracked: "this year yet", of: "this year" },
  all: { label: "All time", tracked: "yet", of: "all time" },
};

/**
 * Guards the `?range=` search param.
 *
 * A search param is user input whatever produced it — a hand-edited URL, a stale
 * bookmark, a link pasted from a chat window — so it is checked rather than
 * cast. `Array.isArray` matters because Next types a repeated param as
 * `string[]`, and an unguarded `includes` would not throw on that, it would just
 * quietly never match and fall through to the default: the same outcome, but by
 * accident rather than by decision.
 */
export function isAnalyticsRange(value: unknown): value is AnalyticsRange {
  return (
    typeof value === "string" &&
    (ANALYTICS_RANGES as readonly string[]).includes(value)
  );
}

/** What a bar represents. Decides how a day key collapses onto a bar key. */
export type BucketUnit = "day" | "week" | "month";

export interface BarSpec {
  /** The bucket key. Days are `YYYY-MM-DD`; months are `YYYY-MM`. */
  key: string;
  /** Axis label under the bar. */
  label: string;
}

export interface AnalyticsRangeSpec {
  range: AnalyticsRange;
  /** Prose name for the window — "This week". Used by every piece of copy. */
  label: string;
  /**
   * Epoch-second bounds, inclusive. `from` is undefined for all-time, the one
   * range the server cannot bound without knowing where the history begins.
   */
  from?: number;
  to: number;
  unit: BucketUnit;
  /**
   * The bars, oldest first. `null` only for all-time, whose axis cannot exist
   * until the history has been read — see `deriveMonthAxis`.
   */
  axis: BarSpec[] | null;
}

/**
 * The spec for `range` as of `reference`, in `timeZone`.
 *
 * Every bound comes from `lib/timezone.ts` and is therefore aligned to the user's
 * own midnight, which is why this is a thin composition of those helpers rather
 * than a place that does its own calendar arithmetic.
 */
export function resolveAnalyticsRange(
  range: AnalyticsRange,
  reference: Date = new Date(),
  timeZone: string = SERVER_TIME_ZONE
): AnalyticsRangeSpec {
  const today = formatDateInZone(reference, timeZone);

  switch (range) {
    case "week": {
      const week = getWeekRange(reference, timeZone);
      return {
        range,
        label: RANGE_PROSE.week.label,
        from: week.from,
        to: week.to,
        unit: "day",
        axis: week.dates.map((key, i) => ({ key, label: week.dayLabels[i] })),
      };
    }

    case "month": {
      return {
        range,
        label: RANGE_PROSE.month.label,
        ...boundsOf(getCalendarRange(reference, timeZone, "month")),
        unit: "week",
        axis: monthWeekAxis(today),
      };
    }

    case "year": {
      const year = Number(today.slice(0, 4));
      return {
        range,
        label: RANGE_PROSE.year.label,
        ...boundsOf(getCalendarRange(reference, timeZone, "year")),
        unit: "month",
        axis: Array.from({ length: 12 }, (_, m) => ({
          key: `${year}-${String(m + 1).padStart(2, "0")}`,
          label: MONTH_LABELS[m],
        })),
      };
    }

    case "all":
      // Unbounded on the left on purpose: "All time" means all of it, and
      // guessing a start would silently drop the oldest sessions out of the one
      // range whose entire promise is that it drops nothing.
      return {
        range,
        label: RANGE_PROSE.all.label,
        from: undefined,
        to: getDayRange(reference, timeZone).to,
        unit: "month",
        axis: null,
      };
  }
}

/** `from`/`to` lifted out of a `DayRange` so a spec literal stays readable. */
function boundsOf(range: { from: number; to: number }) {
  return { from: range.from, to: range.to };
}

/** A bar with its totals folded in. */
export interface Bar extends BarSpec {
  durationSeconds: number;
  sessionCount: number;
}

/** One sparse day of focus time, as `getDailyFocus` returns it. */
export interface DailyFocusDay {
  /** `YYYY-MM-DD`, in the caller's zone. */
  date: string;
  durationSeconds: number;
  sessionCount: number;
}

/**
 * Collapses sparse days onto a range's bar axis.
 *
 * Days with no focus time contribute nothing, and every bar on the axis comes
 * back whether or not it was hit — a bar the user can see at zero height is a
 * period they did not work, which is a fact about the calendar rather than an
 * absence of data. `getDailyAnalytics` pre-seeded its seven buckets for the same
 * reason.
 *
 * A day that lands outside the axis is dropped rather than added. That happens
 * legitimately at the two edges — the month view's first and last week columns
 * hang over the month, and the days in the overhang belong to the neighbouring
 * range — and it is also the symptom to watch for if bounds and bucket keys ever
 * drift apart, because a silently added bar would look like data.
 */
export function foldDaysIntoBars(
  days: DailyFocusDay[],
  axis: BarSpec[],
  unit: BucketUnit
): Bar[] {
  const bars = axis.map((spec) => ({
    ...spec,
    durationSeconds: 0,
    sessionCount: 0,
  }));
  const indexByKey = new Map(bars.map((bar, i) => [bar.key, i]));

  // Only `week` needs a lookup built. A week's key is its Sunday, which no amount
  // of string slicing recovers from a date, so the mapping is walked out of the
  // axis: each column already holds the Sunday that keys it, and covers the seven
  // days from there.
  const weekOfDay = new Map<string, number>();
  if (unit === "week") {
    for (const [i, bar] of bars.entries()) {
      for (let d = 0; d < 7; d++) weekOfDay.set(shiftDateKey(bar.key, d), i);
    }
  }

  for (const day of days) {
    const index =
      unit === "day"
        ? indexByKey.get(day.date)
        : unit === "month"
          ? indexByKey.get(monthKeyOf(day.date))
          : weekOfDay.get(day.date);
    if (index === undefined) continue;

    bars[index].durationSeconds += day.durationSeconds;
    bars[index].sessionCount += day.sessionCount;
  }

  return bars;
}

/**
 * The all-time axis: one bar per month from the first session to this month.
 *
 * Built from the data rather than from a bound, because the server has no idea
 * where a user's history begins — the collection knows, and it just said so.
 * Months in between are filled even though no row mentions them: a month with no
 * focus time still happened, and dropping it would make a gap in the chart read
 * as missing data instead of an empty month.
 *
 * Labels carry the year only when the history crosses one. Within a single year
 * "Jan" is unambiguous and shorter; across five, "Jan" twice is a chart that
 * lies about which Jan is which.
 */
export function deriveMonthAxis(days: DailyFocusDay[], today: string): BarSpec[] {
  const currentMonth = monthKeyOf(today);
  // The earliest day present, or this month if there are none — a first-run user
  // still gets a bar to look at rather than an empty axis.
  const firstMonth = days.length > 0 ? monthKeyOf(days[0].date) : currentMonth;

  const spansYears = firstMonth.slice(0, 4) !== currentMonth.slice(0, 4);

  const axis: BarSpec[] = [];
  for (
    let cursor = `${firstMonth}-01`, end = `${currentMonth}-01`;
    cursor <= end;
    cursor = shiftMonthKey(cursor, 1)
  ) {
    const year = Number(cursor.slice(0, 4));
    const month = Number(cursor.slice(5, 7));
    axis.push({
      key: cursor.slice(0, 7),
      label: spansYears
        ? `${MONTH_LABELS[month - 1]} '${String(year).slice(2)}`
        : MONTH_LABELS[month - 1],
    });
  }

  return axis;
}

/**
 * How many bars to skip between printed labels.
 *
 * A count rather than a breakpoint, so an all-time axis of 40 months and one of 
 * 80 both thin to something legible instead of both overflowing. Twelve is what
 * fits under the chart on a phone with room to spare; below that the stride is 1
 * and every bar is labelled.
 */
export function labelStride(count: number): number {
  return Math.max(1, Math.ceil(count / 12));
}

/**
 * The short caption in the chart header — "Sun – Sat", "Oct 2025 – Sep 2026".
 *
 * Derived from the axis rather than hard-coded per range, so the caption cannot
 * contradict the bars beneath it. That failure is not hypothetical: the chart
 * said "Mon – Sun" for a week while the heatmap below it drew a year.
 */
export function describeAxis(axis: BarSpec[], unit: BucketUnit): string {
  if (axis.length === 0) return "";
  const first = axis[0];
  const last = axis[axis.length - 1];

  // One bar is not a range. Without this, an all-time view whose entire history
  // fits inside a single month — a new user, or anyone who signed up in the last
  // four weeks — captions itself "Oct 2026 – Oct 2026", which reads as a bug in
  // the data rather than a statement about the window.
  //
  // The month case keeps its year even where the two-ended form would drop it.
  // With two bars the reader can see they share one; with one bar "Nov" alone
  // does not say which November, and this is precisely the view a new user has.
  if (axis.length === 1) {
    return unit === "month" ? monthCaption(first.key, false) : first.label;
  }

  if (unit === "month") {
    const sameYear = first.key.slice(0, 4) === last.key.slice(0, 4);
    return `${monthCaption(first.key, sameYear)} – ${monthCaption(last.key, sameYear)}`;
  }

  // Days and week columns are both labelled by their own first day, so naming
  // the two ends is the whole caption. For a month the outer columns hang over
  // the boundary, and the axis labels are already the in-month first day.
  return `${first.label} – ${last.label}`;
}

function monthCaption(monthKey: string, omitYear: boolean): string {
  const name = monthLabelOf(monthKey);
  return omitYear ? name : `${name} ${monthKey.slice(0, 4)}`;
}

/**
 * The week columns a calendar month touches, as bar specs.
 *
 * Sunday-aligned for the same reason the heatmap is: a column is a week, so each
 * one covers seven consecutive days and no two bars overlap. The first and last
 * columns hang over the month boundary by design — the alternative, a "week" cut
 * on the 1st, would make every bar a different number of days wide and the chart
 * would be comparing unequal slices.
 *
 * Each label is the first day of that column which falls *inside* the month, so
 * a column opening on Sep 27 is labelled "Oct 1" — it is counting the month from
 * its first day, and saying otherwise would over-claim a week it never saw.
 */
function monthWeekAxis(anyDateInMonth: string): BarSpec[] {
  const firstOfMonth = `${anyDateInMonth.slice(0, 7)}-01`;
  const lastOfMonth = shiftDateKey(shiftMonthKey(firstOfMonth, 1), -1);

  // `getUTCDay` on a UTC-midnight date is the weekday the user sees, 0 = Sunday.
  const firstSunday = shiftDateKey(
    firstOfMonth,
    -new Date(`${firstOfMonth}T00:00:00.000Z`).getUTCDay()
  );

  const axis: BarSpec[] = [];
  for (let sunday = firstSunday; sunday <= lastOfMonth; sunday = shiftDateKey(sunday, 7)) {
    const labelledDay = sunday < firstOfMonth ? firstOfMonth : sunday;
    axis.push({ key: sunday, label: formatDayInMonth(labelledDay) });
  }

  return axis;
}