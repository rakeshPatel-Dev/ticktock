/**
 * Timezone-correct day and week boundaries.
 *
 * The analytics page buckets sessions by calendar day, and a calendar day is a
 * property of a *place*, not of the server. Two bugs lived here:
 *
 *   1. `$dateToString` without a `timezone` option formats in UTC, while the
 *      week range bounds were computed with the server's local
 *      `Date`. On Vercel that is UTC for the bounds and UTC for the buckets, so
 *      a 9 PM session in Asia/Kolkata landed in the *next* bucket — a day the
 *      range bounds had already excluded, so the time vanished.
 *   2. Even with both sides in the same zone they have to agree on WHICH zone.
 *      The server cannot know it; the browser can. `lib/session.ts` reads the
 *      IANA zone the client parked in a cookie and the queries receive it.
 *
 * Everything here is pure `Intl` arithmetic with no Next.js or Mongo imports, so
 * the same helpers work in a server component, a route handler, and a test
 * script. Zone conversion is done through `Intl` rather than a date library
 * because `date-fns` (already a dependency) has no IANA zone support and
 * hand-rolled offset tables go wrong on DST.
 *
 * Every boundary this module returns is epoch SECONDS, matching the convention
 * the rest of the domain layer uses for timestamps.
 */

/**
 * Weekday initials, Sunday first — the order `getUTCDay` already uses, which is
 * why nothing here has to shift anything.
 *
 * Exported because "name this day" comes up outside the week chart too: the
 * analytics tiles label their best day with the same seven words, so that a tile
 * reading "Wed" points at the Wednesday bar directly above it.
 */
export const WEEKDAY_LABELS = [
  "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
] as const;

const MS_PER_DAY = 86_400_000;

/**
 * Where the browser parks the user's IANA zone. Read server-side by
 * `lib/session.ts#getUserTimeZone`, written by
 * `components/timezone-sync.tsx`. It is a cookie rather than a user document
 * because it is a property of the *device in use* — someone in UTC-5 opening
 * the app on a trip to UTC+9 wants this week's buckets in +9, and a stale
 * profile field would be wrong until they thought to change it.
 */
export const TIMEZONE_COOKIE = "ticktock_tz";

/** One year, in seconds. The zone changes when the user moves, not weekly. */
export const TIMEZONE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The zone the server process itself runs in. Fallback, never the answer. */
export const SERVER_TIME_ZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
})();

/**
 * Whether `Intl` recognises the zone. Used to reject a garbage or stale cookie
 * value instead of letting it reach `$dateToString`, where it would throw and
 * turn a bad cookie into a 500.
 */
export function isValidTimeZone(timeZone: string | undefined | null): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

interface WallClock {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  /** YYYY-MM-DD in the target zone. */
  date: string;
}

/** The wall-clock date an instant falls on, as seen from `timeZone`. */
function getWallClock(instant: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  let year = 0;
  let month = 0;
  let day = 0;
  for (const part of parts) {
    if (part.type === "year") year = Number(part.value);
    else if (part.type === "month") month = Number(part.value);
    else if (part.type === "day") day = Number(part.value);
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  return { year, month, day, date: `${year}-${pad(month)}-${pad(day)}` };
}

/**
 * Milliseconds `timeZone` is AHEAD of UTC at `instant`. Positive east of
 * Greenwich. Derived by asking `Intl` what the wall clock reads, then treating
 * that reading as if it were UTC — the difference is the offset.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const lookup: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") lookup[part.type] = Number(part.value);
  }

  const asIfUtc = Date.UTC(
    lookup.year,
    lookup.month - 1,
    lookup.day,
    // Some ICU builds render midnight as hour 24 even with hour12:false.
    lookup.hour % 24,
    lookup.minute,
    lookup.second
  );

  return asIfUtc - instant.getTime();
}

/**
 * The UTC instant at which `timeZone` reads the given wall-clock time.
 *
 * Two passes because the offset depends on the instant being converted: a
 * spring-forward gap means the first guess lands on the far side of the
 * transition and carries the wrong offset. The second pass uses the offset that
 * is actually in force at the guess, which is the answer except within the one
 * ambiguous hour of an autumn rollback — where a wall-clock time simply does not
 * name a unique instant and the earlier one is the honest choice.
 */
function zonedTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  timeZone: string
): number {
  const wallMs = Date.UTC(year, month - 1, day);
  const firstPass = wallMs - zoneOffsetMs(new Date(wallMs), timeZone);
  return wallMs - zoneOffsetMs(new Date(firstPass), timeZone);
}

/** `YYYY-MM-DD` for an instant, in the given zone. */
export function formatDateInZone(instant: Date, timeZone: string): string {
  return getWallClock(instant, timeZone).date;
}

/** A UTC-midnight `Date` carrying the wall-clock Y/M/D — for weekday maths only. */
function wallCalendarDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Shifts a `YYYY-MM-DD` by whole days without touching any timezone. */
function shiftDateKey(date: string, days: number): string {
  return new Date(wallCalendarDate(date).getTime() + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

export interface DayRange {
  /** Epoch seconds, inclusive. */
  from: number;
  /** Epoch seconds, inclusive. */
  to: number;
}

/**
 * The bounds of the calendar day containing `reference`, as seen from
 * `timeZone`. DST-safe: the end of the day is the start of the NEXT day minus
 * one second, not "midnight plus 24 hours", so a 23-hour day does not leak an
 * hour into its neighbour.
 */
export function getDayRange(
  reference: Date = new Date(),
  timeZone: string = SERVER_TIME_ZONE
): DayRange {
  const { year, month, day, date } = getWallClock(reference, timeZone);
  const fromMs = zonedTimeToUtcMs(year, month, day, timeZone);
  const next = shiftDateKey(date, 1);
  const [ny, nm, nd] = next.split("-").map(Number);
  const toMs = zonedTimeToUtcMs(ny, nm, nd, timeZone);

  return {
    from: Math.floor(fromMs / 1000),
    to: Math.ceil(toMs / 1000) - 1,
  };
}

export interface WeekRange extends DayRange {
  /** The seven `YYYY-MM-DD` keys the buckets are keyed by, Sunday first. */
  dates: string[];
  /** Matching labels, Sunday first. */
  dayLabels: string[];
}

/**
 * The Sunday–Saturday week containing `reference` in `timeZone`, as epoch-second
 * bounds plus the bucket keys to match against.
 *
 * The returned `dates` MUST be the keys used to fold the aggregation: a
 * `$dateToString` bucket is only comparable to a boundary if both were produced
 * with the same zone. Handing these to a query that formats in UTC reintroduces
 * the exact bug this module exists to remove.
 */
export function getWeekRange(
  reference: Date = new Date(),
  timeZone: string = SERVER_TIME_ZONE
): WeekRange {
  const { date } = getWallClock(reference, timeZone);

  // Weekday of the wall-clock date. getUTCDay() on a UTC-midnight date is the
  // weekday the user sees, with no offset arithmetic involved — and it is already
  // Sunday-first (0 = Sunday), which is where the week starts.
  const daysSinceSunday = wallCalendarDate(date).getUTCDay();

  const sundayKey = shiftDateKey(date, -daysSinceSunday);
  const nextSundayKey = shiftDateKey(sundayKey, 7);

  const fromMs = zonedMidnightUtcMs(sundayKey, timeZone);
  const toMs = zonedMidnightUtcMs(nextSundayKey, timeZone);

  return {
    from: Math.floor(fromMs / 1000),
    to: Math.floor(toMs / 1000) - 1,
    dates: Array.from({ length: 7 }, (_, i) => shiftDateKey(sundayKey, i)),
    dayLabels: [...WEEKDAY_LABELS],
  };
}

/** UTC instant of local midnight on the `YYYY-MM-DD` given, in `timeZone`. */
function zonedMidnightUtcMs(dateKey: string, timeZone: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return zonedTimeToUtcMs(year, month, day, timeZone);
}

export interface HeatmapRange extends DayRange {
  /**
   * Week columns, oldest first. Each is seven `YYYY-MM-DD` keys, Sunday first.
   *
   * Returned as a grid rather than a flat list of days because the cell order IS
   * the layout: column-major would need a transpose, and rows-first would draw
   * the calendar upside down relative to the `dayLabels` above it.
   */
  columns: string[][];
  /** The user's current `YYYY-MM-DD`. Cells after it have not happened yet. */
  today: string;
}

/**
 * The Sunday-aligned window a calendar heatmap draws, in `timeZone`.
 *
 * Aligned to Sundays for the same reason `getWeekRange` is: a heatmap column is
 * a week, so the leftmost column has to be a whole Sun–Sat or every row after
 * the first is offset by a different number of days and the grid shears.
 *
 * `to` is the end of *today*, not the end of the current week. The trailing days
 * of this week are rendered as future and carry no data, so leaving them in the
 * range only invites a forward-dated session (client clock ahead of the server's
 * `MAX_START_SKEW_SECONDS` window) to land in a cell the UI deliberately paints
 * blank — data dropped for a reason that has nothing to do with the range.
 *
 * `weeks` is required rather than defaulted to keep this module free of app
 * constants; `lib/heatmap.ts` owns the value.
 */
export function getHeatmapRange(
  reference: Date,
  timeZone: string,
  weeks: number
): HeatmapRange {
  const { date } = getWallClock(reference, timeZone);

  // Same Sunday-first walk as `getWeekRange`, then step back whole weeks so the
  // oldest column is a Sunday too.
  const daysSinceSunday = wallCalendarDate(date).getUTCDay();
  const thisSunday = shiftDateKey(date, -daysSinceSunday);
  const firstSunday = shiftDateKey(thisSunday, -7 * (weeks - 1));

  return {
    from: Math.floor(zonedMidnightUtcMs(firstSunday, timeZone) / 1000),
    to: getDayRange(reference, timeZone).to,
    today: date,
    columns: Array.from({ length: weeks }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => shiftDateKey(firstSunday, w * 7 + d))
    ),
  };
}

/**
 * `$dateToString` options that format `startedAt` in the user's zone.
 *
 * Passing this is the server-side half of the fix; the `dates` from
 * `getWeekRange` are the other half. Omit it and Mongo silently uses UTC.
 */
export function dateToStringOptions(timeZone: string) {
  return {
    format: "%Y-%m-%d",
    timezone: timeZone,
  } as const;
}
