import { db } from "@/db";
import { sessions, type StudySession } from "@/db/schema";
import { eq, desc, and, gte, lte, inArray, like, or } from "drizzle-orm";

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
 * Returns the currently active or paused session for a user, if any.
 */
export async function getActiveSession(
  userId: string
): Promise<StudySession | null> {
  const result = await db
    .select()
    .from(sessions)
    .where(
      and(
        inArray(sessions.status, ["active", "paused"]),
        eq(sessions.userId, userId)
      )
    )
    .orderBy(desc(sessions.startedAt))
    .limit(1);

  return result[0] ?? null;
}

/**
 * Returns a single session by its unique ID (scoped to the user).
 */
export async function getSessionById(
  userId: string,
  id: string
): Promise<StudySession | null> {
  const result = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    .limit(1);

  return result[0] ?? null;
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
  const conditions = [eq(sessions.userId, userId)];

  if (options?.from) {
    const fromTimestamp = Math.floor(options.from.getTime() / 1000);
    conditions.push(gte(sessions.startedAt, fromTimestamp));
  }

  if (options?.to) {
    const toTimestamp = Math.floor(options.to.getTime() / 1000);
    conditions.push(lte(sessions.startedAt, toTimestamp));
  }

  if (options?.subject && options.subject !== "all") {
    conditions.push(eq(sessions.subject, options.subject));
  }

  if (options?.search && options.search.trim()) {
    const term = `%${options.search.trim()}%`;
    const searchCond = or(
      like(sessions.subject, term),
      like(sessions.topic, term),
      like(sessions.notes, term),
      like(sessions.goal, term)
    );
    if (searchCond) {
      conditions.push(searchCond);
    }
  }

  const query = db
    .select()
    .from(sessions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(sessions.startedAt));

  if (options?.limit) {
    return await query.limit(options.limit);
  }

  return await query;
}

/**
 * Returns all distinct subject names ever tracked by a user.
 */
export async function getAllSubjects(userId: string): Promise<string[]> {
  const allSessions = await db
    .select({ subject: sessions.subject })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.startedAt));

  const unique = Array.from(new Set(allSessions.map((s) => s.subject.trim())));
  return unique.filter(Boolean);
}

/**
 * Computes the dashboard summary for today.
 */
export async function getDashboardSummary(
  userId: string,
  targetDate: Date = new Date()
): Promise<DashboardSummary> {
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const startTimestamp = Math.floor(startOfDay.getTime() / 1000);

  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);
  const endTimestamp = Math.floor(endOfDay.getTime() / 1000);

  const todaySessions = await db
    .select()
    .from(sessions)
    .where(
      and(
        gte(sessions.startedAt, startTimestamp),
        lte(sessions.startedAt, endTimestamp),
        eq(sessions.userId, userId)
      )
    );

  const activeSession = await getActiveSession(userId);

  let totalFocusedSeconds = 0;
  let longestSessionSeconds = 0;
  let sessionCount = 0;
  const subjectsSet = new Set<string>();

  for (const session of todaySessions) {
    if (session.status === "completed") {
      totalFocusedSeconds += session.durationSeconds;
      if (session.durationSeconds > longestSessionSeconds) {
        longestSessionSeconds = session.durationSeconds;
      }
      sessionCount++;
      subjectsSet.add(session.subject);
    }
  }

  // Fetch the 10 most recent sessions for the dashboard list
  const recentSessions = await db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.status, "completed"), eq(sessions.userId, userId))
    )
    .orderBy(desc(sessions.startedAt))
    .limit(10);

  return {
    totalFocusedSeconds,
    sessionCount,
    subjectCount: subjectsSet.size,
    longestSessionSeconds,
    recentSessions,
    activeSession,
  };
}

/**
 * Returns daily activity breakdown for the current week (Monday through Sunday).
 */
export async function getDailyAnalytics(
  userId: string,
  targetDate: Date = new Date()
): Promise<DailyMetric[]> {
  const curr = new Date(targetDate);
  // Get Monday of current week
  const day = curr.getDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(curr);
  monday.setDate(curr.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const fromTimestamp = Math.floor(monday.getTime() / 1000);
  const toTimestamp = Math.floor(sunday.getTime() / 1000);

  const weekSessions = await db
    .select()
    .from(sessions)
    .where(
      and(
        gte(sessions.startedAt, fromTimestamp),
        lte(sessions.startedAt, toTimestamp),
        eq(sessions.status, "completed"),
        eq(sessions.userId, userId)
      )
    );

  // Initialize the 7 days of the week
  const daysMap: { [dateStr: string]: { duration: number; count: number } } = {};
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const result: DailyMetric[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    daysMap[dateStr] = { duration: 0, count: 0 };
    result.push({
      date: dateStr,
      dayLabel: dayLabels[i],
      durationSeconds: 0,
      sessionCount: 0,
    });
  }

  for (const s of weekSessions) {
    const sDate = new Date(s.startedAt * 1000).toISOString().split("T")[0];
    if (daysMap[sDate]) {
      daysMap[sDate].duration += s.durationSeconds;
      daysMap[sDate].count += 1;
    }
  }

  return result.map((item) => ({
    ...item,
    durationSeconds: daysMap[item.date]?.duration || 0,
    sessionCount: daysMap[item.date]?.count || 0,
  }));
}

/**
 * Returns focus time grouped by subject.
 */
export async function getSubjectAnalytics(
  userId: string
): Promise<SubjectMetric[]> {
  const completedSessions = await db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.status, "completed"), eq(sessions.userId, userId))
    );

  const map = new Map<string, { duration: number; count: number }>();
  let totalAllDuration = 0;

  for (const s of completedSessions) {
    const current = map.get(s.subject) || { duration: 0, count: 0 };
    current.duration += s.durationSeconds;
    current.count += 1;
    map.set(s.subject, current);
    totalAllDuration += s.durationSeconds;
  }

  const list: SubjectMetric[] = [];
  for (const [subject, data] of map.entries()) {
    list.push({
      subject,
      durationSeconds: data.duration,
      sessionCount: data.count,
      percentage:
        totalAllDuration > 0
          ? Math.round((data.duration / totalAllDuration) * 100)
          : 0,
    });
  }

  return list.sort((a, b) => b.durationSeconds - a.durationSeconds);
}

/**
 * Returns focus time grouped by topic under subjects.
 */
export async function getTopicAnalytics(
  userId: string
): Promise<TopicMetric[]> {
  const completedSessions = await db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.status, "completed"), eq(sessions.userId, userId))
    );

  const map = new Map<string, { subject: string; topic: string; duration: number }>();

  for (const s of completedSessions) {
    if (!s.topic || !s.topic.trim()) continue;
    const key = `${s.subject}:::${s.topic.trim()}`;
    const current = map.get(key) || {
      subject: s.subject,
      topic: s.topic.trim(),
      duration: 0,
    };
    current.duration += s.durationSeconds;
    map.set(key, current);
  }

  const list: TopicMetric[] = Array.from(map.values()).map((item) => ({
    subject: item.subject,
    topic: item.topic,
    durationSeconds: item.duration,
  }));

  return list.sort((a, b) => b.durationSeconds - a.durationSeconds);
}
