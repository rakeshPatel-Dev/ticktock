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
  getWeekRange,
  SERVER_TIME_ZONE,
} from "@/lib/timezone";
import { normalizeSubject } from "@/lib/subjects";

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
  activeSession: StudySession | null;
}

export interface DailyMetric {
  date: string; // YYYY-MM-DD
  dayLabel: string; // "Mon", "Tue", etc.
  durationSeconds: number;
  sessionCount: number;
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
 * `subject` folded the way `lib/subjects.ts#subjectKey` folds it, but as an
 * aggregation expression so the SERVER does the folding. Applied at read time on
 * purpose: it merges the "Python" and "python" documents that already exist
 * instead of only the ones written after normalisation landed, which would leave
 * every historical duplicate in place.
 *
 * The operator is `$replaceAll` with a `find` regex — `$trim` on its own only
 * strips the ends, and a pasted "Data  Structures" would keep the double space
 * that forks the group.
 *
 * Casing is dropped only in the key. What the user reads stays their casing,
 * carried alongside through the display variant of the same expression.
 */
function foldTextExpression(
  field: string,
  lower: boolean
): Record<string, unknown> {
  const collapsed = {
    $trim: {
      input: { $replaceAll: { input: `$${field}`, find: /\s+/g, replacement: " " } },
    },
  };
  return lower ? { $toLower: collapsed } : collapsed;
}

const subjectKeyExpression = foldTextExpression("subject", true);
const subjectDisplayExpression = foldTextExpression("subject", false);
const topicKeyExpression = foldTextExpression("topic", true);
const topicDisplayExpression = foldTextExpression("topic", false);

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
    // Case-insensitive AND whitespace-insensitive, folded server-side with the
    // same expression the analytics group by. An exact `subject: "python"`
    // matches nothing the moment the stored row says "Python", and a JS-side
    // `===` filter would agree with the wrong half of the list. Escaped so a
    // subject called "C++" or "a.b" cannot inject regex syntax.
    const pattern = new RegExp(
      `^${escapeRegex(normalizeSubject(options.subject))}$`,
      "i"
    );
    conditions.push({
      $expr: {
        $regexMatch: {
          input: subjectKeyExpression,
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

  return grouped.map((row) => row.subject).filter(Boolean);
}

/**
 * Computes the dashboard summary for the calendar day containing `targetDate`,
 * as seen from `timeZone`.
 */
export async function getDashboardSummary(
  userId: string,
  targetDate: Date = new Date(),
  timeZone: string = SERVER_TIME_ZONE
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
    getActiveSession(userId),
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
 * Returns daily activity breakdown for the week (Monday through Sunday) that
 * contains `targetDate`, bucketed by calendar day in `timeZone`.
 */
export async function getDailyAnalytics(
  userId: string,
  targetDate: Date = new Date(),
  timeZone: string = SERVER_TIME_ZONE
): Promise<DailyMetric[]> {
  // ONE range object feeds both halves of this query. That is the whole fix:
  // the bounds and the bucket keys are derived from the same week, so a
  // session can never be matched by the range and then filed under a key the
  // range did not contain.
  const week = getWeekRange(targetDate, timeZone);

  // Aggregate server-side so a user's whole week never lands in JS memory.
  //
  // The `timezone` option on `$dateToString` is load-bearing. Without it Mongo
  // formats in UTC while the bounds above are zoned, and a 9 PM session in a
  // UTC+ zone becomes tomorrow's key — a key outside the range, so its minutes
  // are silently dropped instead of shown on the wrong bar.
  const grouped = await studySessions
    .aggregate<{ _id: string; duration: number; count: number }>([
      {
        $match: {
          userId,
          status: "completed",
          startedAt: {
            $gte: fromEpochSeconds(week.from),
            $lte: fromEpochSeconds(week.to),
          },
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
    ])
    .toArray();

  // Pre-seed the 7 buckets so empty days render as zero rather than missing,
  // keyed by the same date strings the aggregation produced.
  const daysMap: Record<string, { duration: number; count: number }> = {};

  const result: DailyMetric[] = week.dates.map((date, i) => {
    daysMap[date] = { duration: 0, count: 0 };
    return {
      date,
      dayLabel: week.dayLabels[i],
      durationSeconds: 0,
      sessionCount: 0,
    };
  });

  for (const row of grouped) {
    const bucket = daysMap[row._id];
    if (bucket) {
      bucket.duration += row.duration;
      bucket.count += row.count;
    }
  }

  return result.map((item) => ({
    ...item,
    durationSeconds: daysMap[item.date]?.duration || 0,
    sessionCount: daysMap[item.date]?.count || 0,
  }));
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

  const totalAllDuration = grouped.reduce((total, row) => total + row.duration, 0);

  const list: SubjectMetric[] = grouped.map((row) => ({
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

  const list: TopicMetric[] = grouped.map((row) => ({
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
