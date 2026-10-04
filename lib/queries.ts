import type { Filter } from "mongodb";
import { studySessions } from "@/db";
import {
  escapeRegex,
  fromEpochSeconds,
  toStudySession,
  type StudySession,
  type StudySessionDoc,
} from "@/db/schema";
import {
  dateToStringOptions,
  getDayRange,
  SERVER_TIME_ZONE,
} from "@/lib/timezone";
import { normalizeSubject, subjectKey } from "@/lib/subjects";
import type { DailyFocusDay } from "@/lib/analytics-range";

/** One sparse day of focus time. Re-exported so consumers need not import both. */
export type DailyFocusMetric = DailyFocusDay;

/** The heatmap's name for the same rows. */
export type HeatmapMetric = DailyFocusMetric;

/** Epoch-second bounds. Absent fields mean "unbounded on that side". */
export interface RangeFilter {
  from?: number;
  to?: number;
}

export interface DashboardSummary {
  totalFocusedSeconds: number;
  sessionCount: number;
  subjectCount: number;
  longestSessionSeconds: number;
  recentSessions: StudySession[];
  /**
   * Only populated when `includeActiveSession` is left on. The dashboard's
   * Timer reads it from its own stream boundary instead, so the summary stream
   * turns it off and skips a second identical read.
   */
  activeSession?: StudySession | null;
}

export interface SubjectMetric {
  subject: string;
  durationSeconds: number;
  percentage: number;
  sessionCount: number;
}

export interface TopicMetric {
  subject: string;
  topic: string;
  durationSeconds: number;
}

/**
 * `subject` folded the way `lib/subjects.ts#subjectKey` folds it, but as far as
 * the aggregation pipeline is able to. Applied at read time on purpose: it merges
 * the "Python" and "python" documents that already exist instead of only the ones
 * written after normalisation landed, which would leave every historical
 * duplicate in place.
 *
 * This is `$trim` + `$toLower` and nothing more, and the ceiling is the server's,
 * not a choice. An earlier version reached for `$replaceAll` with a `find`
 * regex to squash internal whitespace runs; `$replaceAll` rejects that outright
 * — `find` must be a *string*, and it is a literal replace, not a pattern
 * replace, so there is no regex form of it to fall back on:
 *
 *   $replaceAll requires that 'find' be a string, found: /\s+/s   (code 51745)
 *
 * The only reason this ever looked healthy is that the pipeline short-circuits
 * on an empty collection: a user with no sessions never evaluates the
 * expression, so the throw stayed hidden until their first session — at which
 * point the dashboard, the whole analytics page and the subject filter all
 * failed at once.
 *
 * So the two halves of the fold are split across the boundary. `$trim` and
 * `$toLower` run server-side, where they are cheap, indexed and correct for
 * leading/trailing whitespace and for casing. Collapsing *internal* runs needs
 * the full `subjectKey`, so it runs in JS on the already-grouped rows — of which
 * there is one per distinct trimmed subject, not one per session. `mergeFolded`
 * below does that re-group, and every caller that groups by a folded key uses it.
 */
function foldTextExpression(
  field: string,
  lower: boolean
): Record<string, unknown> {
  const trimmed = { $trim: { input: `$${field}` } };
  return lower ? { $toLower: trimmed } : trimmed;
}

const subjectKeyExpression = foldTextExpression("subject", true);
const subjectDisplayExpression = foldTextExpression("subject", false);
const topicKeyExpression = foldTextExpression("topic", true);
const topicDisplayExpression = foldTextExpression("topic", false);

/**
 * Second half of the fold described on `foldTextExpression`: merges rows the
 * server could only trim and lower-case, using the full `subjectKey` so that
 * "Data  Structures" and "Data Structures" become one subject.
 *
 * The input is an aggregation's `$group` output, so it already holds one row per
 * distinct trimmed/lowered subject — the size of the subject vocabulary, not the
 * size of the session history. That is what makes doing the rest of the fold in
 * JS affordable.
 *
 * Order is first-seen-wins, which preserves the `$first` display spelling the
 * aggregation chose (it sorts by `startedAt` descending, so the newest
 * spelling of a merged subject is the one the user sees). `onMerge` folds the
 * source row's totals into the row that is being kept.
 */
function mergeFolded<T>(
  rows: T[],
  keyOf: (row: T) => string,
  onMerge: (kept: T, extra: T) => void
): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    const kept = byKey.get(key);
    if (kept) onMerge(kept, row);
    else byKey.set(key, row);
  }
  return Array.from(byKey.values());
}

/**
 * Returns the currently active or paused session for a user, if any.
 */
export async function getActiveSession(
  userId: string
): Promise<StudySession | null> {
  const doc = await studySessions.findOne(
    { userId, status: { $in: ["active", "paused"] } },
    { sort: { startedAt: -1 } }
  );

  return doc ? toStudySession(doc) : null;
}

/**
 * Returns a single session by its unique ID (scoped to the user).
 */
export async function getSessionById(
  userId: string,
  id: string
): Promise<StudySession | null> {
  const doc = await studySessions.findOne({ _id: id, userId });

  return doc ? toStudySession(doc) : null;
}

/**
 * Hard ceiling on how much history a single `/sessions` load will pull.
 *
 * The list filters, searches and date-ranges entirely on the client, so the
 * page used to ship every session the user has ever logged. That is fine at
 * twenty rows and quadratic-ish in payload and hydration cost at twenty
 * thousand. The cap is set well above a realistic study history so it is
 * invisible in normal use, and `SessionsStream` fetches one extra row to detect
 * that it was hit and tell the user, rather than quietly showing them a
 * truncated history that looks complete.
 */
export const SESSION_HISTORY_LIMIT = 250;

/**
 * Exact number of sessions a user has, ignoring `SESSION_HISTORY_LIMIT`.
 *
 * `countDocuments` rather than `estimatedDocumentCount`: the estimate reads
 * collection metadata, can be stale after deletes, and this number is shown to
 * the user as the true size of their history. It is only ever called on the
 * rare request where the cap was actually reached.
 */
export async function getSessionCount(userId: string): Promise<number> {
  return studySessions.countDocuments({ userId });
}

/**
 * Returns filtered historical sessions for a user.
 */
export async function getSessions(
  userId: string,
  options?: {
    from?: Date;
    to?: Date;
    subject?: string;
    search?: string;
    limit?: number;
  }
): Promise<StudySession[]> {
  const conditions: Filter<StudySessionDoc>[] = [{ userId }];

  if (options?.from) {
    // Truncate to whole seconds so the bound matches what the integer column
    // comparison used to do.
    conditions.push({
      startedAt: { $gte: fromEpochSeconds(Math.floor(options.from.getTime() / 1000)) },
    });
  }

  if (options?.to) {
    conditions.push({
      startedAt: { $lte: fromEpochSeconds(Math.floor(options.to.getTime() / 1000)) },
    });
  }

  if (options?.subject && options.subject !== "all") {
    // Case-insensitive AND whitespace-insensitive. The server can only `$trim`
    // (see `foldTextExpression`), so the pattern is what absorbs the internal
    // whitespace difference: every literal space becomes `\s+`, which matches
    // "Data Structures" and "Data  Structures" alike while still refusing
    // "Data Structures Advanced". An exact `subject: "python"` matches nothing
    // the moment the stored row says "Python", and a JS-side `===` filter would
    // agree with the wrong half of the list. Escaped so a subject called "C++"
    // or "a.b" cannot inject regex syntax.
    const pattern = new RegExp(
      `^${escapeRegex(normalizeSubject(options.subject)).replace(/ /g, "\\s+")}$`,
      "i"
    );
    conditions.push({
      $expr: {
        $regexMatch: {
          input: { $trim: { input: "$subject" } },
          regex: pattern.source,
          options: "i",
        },
      },
    });
  }

  if (options?.search && options.search.trim()) {
    // Leading-wildcard matching, escaped so user input cannot inject regex
    // syntax. A `$text` index is not an option here: `$text` queries cannot be
    // sorted by anything but relevance score, and this query always orders by
    // `startedAt`.
    const pattern = new RegExp(escapeRegex(options.search.trim()), "i");
    conditions.push({
      $or: [
        { subject: pattern },
        { topic: pattern },
        { notes: pattern },
        { goal: pattern },
      ],
    });
  }

  const cursor = studySessions
    .find(conditions.length > 0 ? { $and: conditions } : {})
    .sort({ startedAt: -1 });

  if (options?.limit) {
    cursor.limit(options.limit);
  }

  return (await cursor.toArray()).map(toStudySession);
}

/**
 * Returns all distinct subject names ever tracked by a user.
 *
 * Distinct by case-insensitive key, not by string. Grouping on the raw `$subject`
 * returned "Python" and "python" as two entries and offered both in the filter
 * dropdown, where picking one then matched only half the sessions.
 */
export async function getAllSubjects(userId: string): Promise<string[]> {
  const grouped = await studySessions
    .aggregate<{ _id: string; subject: string }>([
      { $match: { userId, subject: { $type: "string" } } },
      // Most recent first, so `$first` is the spelling the user last used.
      { $sort: { startedAt: -1 } },
      {
        $group: {
          _id: subjectKeyExpression,
          subject: { $first: subjectDisplayExpression },
        },
      },
    ])
    .toArray();

  return mergeFolded(
    grouped,
    (row) => subjectKey(row.subject),
    () => {}
  ).map((row) => row.subject).filter(Boolean);
}

/**
 * Computes the dashboard summary for the calendar day containing `targetDate`,
 * as seen from `timeZone`.
 *
 * `includeActiveSession` exists so this can share the dashboard with the Timer
 * without both of them reading the same row. The two render in separate
 * Suspense boundaries and each fires its own queries, so leaving the flag on
 * would mean `getActiveSession` runs twice per navigation for one answer.
 */
export async function getDashboardSummary(
  userId: string,
  targetDate: Date = new Date(),
  timeZone: string = SERVER_TIME_ZONE,
  includeActiveSession: boolean = true
): Promise<DashboardSummary> {
  // The user's midnight, not the server's. Same bug class as the weekly
  // buckets: a 10 PM session in Asia/Kolkata belongs to that user's today, and
  // a UTC day boundary files it under tomorrow.
  const { from: startTimestamp, to: endTimestamp } = getDayRange(
    targetDate,
    timeZone
  );

  // Three independent reads — fire them concurrently rather than in sequence.
  const [todayDocs, activeSession, recentDocs] = await Promise.all([
    studySessions
      .find({
        userId,
        startedAt: {
          $gte: fromEpochSeconds(startTimestamp),
          $lte: fromEpochSeconds(endTimestamp),
        },
      })
      .toArray(),
    includeActiveSession ? getActiveSession(userId) : Promise.resolve(null),
    studySessions
      .find({ userId, status: "completed" })
      .sort({ startedAt: -1 })
      .limit(10)
      .toArray(),
  ]);

  let totalFocusedSeconds = 0;
  let longestSessionSeconds = 0;
  let sessionCount = 0;
  const subjectsSet = new Set<string>();

  for (const doc of todayDocs) {
    if (doc.status === "completed") {
      totalFocusedSeconds += doc.durationSeconds;
      if (doc.durationSeconds > longestSessionSeconds) {
        longestSessionSeconds = doc.durationSeconds;
      }
      sessionCount++;
      subjectsSet.add(doc.subject);
    }
  }

  return {
    totalFocusedSeconds,
    sessionCount,
    subjectCount: subjectsSet.size,
    longestSessionSeconds,
    recentSessions: recentDocs.map(toStudySession),
    activeSession,
  };
}

/**
 * Returns focus time grouped by subject, optionally scoped to a range.
 *
 * Callers that pass no range get all-time totals, which is correct for a
 * "your whole history" panel and wrong for anything sitting under a week
 * header — the totals then disagree with the chart above them. Pass the same
 * `getWeekRange` result used for the chart when the panel is weekly.
 */
export async function getSubjectAnalytics(
  userId: string,
  range?: RangeFilter
): Promise<SubjectMetric[]> {
  const grouped = await studySessions
    .aggregate<{
      _id: string;
      subject: string;
      duration: number;
      count: number;
    }>([
      {
        $match: {
          userId,
          status: "completed",
          subject: { $type: "string" },
          ...startedAtInRange(range),
        },
      },
      { $sort: { startedAt: -1 } },
      {
        $group: {
          _id: subjectKeyExpression,
          subject: { $first: subjectDisplayExpression },
          duration: { $sum: "$durationSeconds" },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  // The server folded as far as `$trim` + `$toLower`; `mergeFolded` finishes the
  // job with the real key so the totals below are per-subject, not per-spelling.
  const merged = mergeFolded(
    grouped,
    (row) => subjectKey(row.subject),
    (kept, extra) => {
      kept.duration += extra.duration;
      kept.count += extra.count;
    }
  );

  const totalAllDuration = merged.reduce((total, row) => total + row.duration, 0);

  const list: SubjectMetric[] = merged.map((row) => ({
    subject: row.subject,
    durationSeconds: row.duration,
    sessionCount: row.count,
    percentage:
      totalAllDuration > 0
        ? Math.round((row.duration / totalAllDuration) * 100)
        : 0,
  }));

  // Subject is the tie-breaker: without it two subjects with equal totals can
  // swap places between page loads, which reads as the data being wrong.
  return list.sort(
    (a, b) => b.durationSeconds - a.durationSeconds || a.subject.localeCompare(b.subject)
  );
}

/**
 * Returns focus time grouped by topic under subjects, optionally scoped to a
 * range. Same range contract as `getSubjectAnalytics`.
 */
export async function getTopicAnalytics(
  userId: string,
  range?: RangeFilter
): Promise<TopicMetric[]> {
  const grouped = await studySessions
    .aggregate<{
      _id: { subject: string; topic: string };
      subject: string;
      topic: string;
      duration: number;
    }>([
      {
        $match: {
          userId,
          status: "completed",
          subject: { $type: "string" },
          topic: { $type: "string" },
          ...startedAtInRange(range),
        },
      },
      {
        $project: {
          startedAt: 1,
          subjectKey: subjectKeyExpression,
          subject: subjectDisplayExpression,
          topicKey: topicKeyExpression,
          topic: topicDisplayExpression,
          durationSeconds: 1,
        },
      },
      // The $match is on the FOLDED topic, so a row of nothing but spaces is
      // dropped here rather than becoming a group keyed to "".
      { $match: { topicKey: { $ne: "" } } },
      // Most recent first so `$first` is the spelling the user last used,
      // whichever of the two spellings the group merged.
      { $sort: { startedAt: -1 } },
      {
        $group: {
          _id: { subject: "$subjectKey", topic: "$topicKey" },
          subject: { $first: "$subject" },
          topic: { $first: "$topic" },
          duration: { $sum: "$durationSeconds" },
        },
      },
    ])
    .toArray();

  const merged = mergeFolded(
    grouped,
    (row) => `${subjectKey(row.subject)}\u0000${subjectKey(row.topic)}`,
    (kept, extra) => {
      kept.duration += extra.duration;
    }
  );

  const list: TopicMetric[] = merged.map((row) => ({
    subject: row.subject,
    topic: row.topic,
    durationSeconds: row.duration,
  }));

  return list.sort(
    (a, b) =>
      b.durationSeconds - a.durationSeconds ||
      a.subject.localeCompare(b.subject) ||
      a.topic.localeCompare(b.topic)
  );
}

/**
 * Focus time per calendar day over a range, in the user's own zone.
 *
 * Deliberately SPARSE — one row per day that has focus time, and no row at all
 * for the rest. Both consumers want that: the heatmap looks days up in a Map and
 * paints a miss as the absent swatch, which is the same answer for free, and
 * `foldDaysIntoBars` starts from the range's axis and fills the gaps itself.
 * Pre-seeding here would mean shipping a mostly-zero object per day across the
 * RSC boundary — 7 for a week, which is harmless, and 364 for a heatmap or a
 * multi-year all-time range, which is not.
 *
 * `timeZone` has to be the zone the caller derived the range with, and this is
 * the second half of that contract: bounds and bucket keys from one zone, or the
 * minutes are dropped rather than shown on the wrong day. Passing the server's
 * own zone here reintroduces exactly the bug `lib/timezone.ts` documents.
 *
 * Days with only zero-duration completed sessions are excluded by the
 * `durationSeconds` filter below, so "a day you did not focus" and "a day that
 * happens to appear in the index" stay the same thing.
 */
export async function getDailyFocus(
  userId: string,
  range: RangeFilter,
  timeZone: string = SERVER_TIME_ZONE
): Promise<DailyFocusMetric[]> {
  const grouped = await studySessions
    .aggregate<{ _id: string; duration: number; count: number }>([
      {
        $match: {
          userId,
          status: "completed",
          durationSeconds: { $gt: 0 },
          ...startedAtInRange(range),
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { ...dateToStringOptions(timeZone), date: "$startedAt" },
          },
          duration: { $sum: "$durationSeconds" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  return grouped.map((row) => ({
    date: row._id,
    durationSeconds: row.duration,
    sessionCount: row.count,
  }));
}

/**
 * The heatmap's name for `getDailyFocus`, kept because the grid is the one
 * consumer whose name says what it is for.
 *
 * It is a rename with no wrapper: the chart and the heatmap want the same rows
 * and there is only one aggregation behind them.
 */
export const getHeatmapAnalytics = getDailyFocus;

/**
 * Turns an optional epoch-second range into a `startedAt` clause.
 *
 * The conversion to BSON `Date` is not optional: `RangeFilter` speaks the
 * domain layer's epoch seconds while the collection holds `Date`s, and a raw
 * number compares against a `Date` as a BSON type-ordering no-op rather than a
 * range — which silently matches nothing instead of erroring.
 */
function startedAtInRange(range?: RangeFilter): { startedAt?: Filter<Date> } {
  if (!range) return {};
  const startedAt: Filter<Date> = {};
  if (range.from !== undefined) startedAt.$gte = fromEpochSeconds(range.from);
  if (range.to !== undefined) startedAt.$lte = fromEpochSeconds(range.to);
  return Object.keys(startedAt).length > 0 ? { startedAt } : {};
}
