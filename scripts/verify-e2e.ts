import "./_load-env";

import { MongoServerError } from "mongodb";
import { client, studySessions, users } from "../db";
import { ensureIndexes } from "../db/indexes";
import {
  fromStudySession,
  pauseAnchorSeconds,
  toStudySession,
  toUpdateDoc,
} from "../db/schema";
import {
  getActiveSession,
  getAllSubjects,
  getDailyAnalytics,
  getDashboardSummary,
  getHeatmapAnalytics,
  getSessionById,
  getSessions,
  getSubjectAnalytics,
  getTopicAnalytics,
} from "../lib/queries";
import { formatDateInZone, getDayRange, getHeatmapRange, getWeekRange } from "../lib/timezone";
import { getHeatmapLevel, HEATMAP_LEVELS, HEATMAP_WEEKS } from "../lib/heatmap";
import { canSkipReconcile } from "../lib/timer-store";
import {
  formatTimerDisplay,
  freshStopwatch,
  isRunning,
  MAX_START_SKEW_SECONDS,
  parsePersistedStopwatch,
  pauseSegment,
  resolveStartedAt,
  restoreStopwatch,
  serializeStopwatch,
  startSegment,
  stopwatchElapsedMs,
} from "../lib/timer";

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`✓ ${label}`);
  } else {
    failures++;
    console.error(`✗ ${label}`);
    if (detail !== undefined) {
      console.error(`   got: ${JSON.stringify(detail)}`);
    }
  }
}

async function runVerification() {
  const username = getArg("--user");
  console.log("--- Starting TickTock Query-Layer Verification ---");

  if (!username) {
    console.error(
      "Usage: npm run test:e2e -- --user <username>\nPass the username of an account created at /signup."
    );
    process.exit(1);
  }

  // The concurrency test below depends on the partial unique index existing.
  await ensureIndexes();

  // Resolve the user (server actions are cookie-gated, so we test the query layer directly)
  const userDoc = await users.findOne({ username });
  if (!userDoc) {
    console.error(`No account found for "${username}". Create one at /signup first.`);
    process.exit(1);
  }
  const userId = userDoc._id;
  console.log(`Verifying against user "${username}" (${userId})...\n`);

  // Clear existing sessions for this user
  await studySessions.deleteMany({ userId });

  // 1. Initial state: no active session
  check("Initial active session is null", (await getActiveSession(userId)) === null);

  // 2. Seed an active session (server actions can't run headless — they're cookie-gated)
  const sessionId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await studySessions.insertOne(
    fromStudySession({
      id: sessionId,
      userId,
      subject: "DSA",
      topic: "Binary Search",
      goal: "Solve 5 problems",
      status: "active",
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })
  );
  check("Session seeded", true);

  // 3. Concurrency invariant: the database refuses a second active/paused session.
  //    Previously this test inserted a duplicate on purpose and asserted that
  //    getActiveSession happened to return the first one — which proved nothing.
  //    Now the active_session_uniq partial unique index is the thing under test.
  const dupId = crypto.randomUUID();
  let duplicateRejected = false;
  try {
    await studySessions.insertOne(
      fromStudySession({
        id: dupId,
        userId,
        subject: "OS",
        topic: "Kernel",
        goal: "Read chapter 4",
        status: "active",
        startedAt: now,
        createdAt: now,
        updatedAt: now,
      })
    );
  } catch (err) {
    duplicateRejected = err instanceof MongoServerError && err.code === 11000;
  }
  check("Second active session rejected by unique index", duplicateRejected);
  check(
    "Active session is still the first seeded session",
    (await getActiveSession(userId))?.id === sessionId
  );

  // 4. Active session retrieval
  const active = await getActiveSession(userId);
  check("Active session retrieved", active?.id === sessionId && active.status === "active", active);

  // 5 & 6. Legacy paused rows. The app no longer writes `status: "paused"` —
  //     pausing is local state and never reaches the database — but rows written
  //     before that are still out there, and the query layer has to keep handing
  //     them back so the client can rebuild from their `pausedAt` anchor. This is
  //     the shape an old row actually has: paused, with no `pausedAt`.
  await studySessions.updateOne(
    { _id: sessionId },
    { $set: { status: "paused", updatedAt: new Date(now * 1000) } }
  );
  check("A legacy paused row is still returned as active", (await getActiveSession(userId))?.status === "paused");

  await studySessions.updateOne(
    { _id: sessionId },
    { $set: { status: "active", updatedAt: new Date(now * 1000) } }
  );
  check("Session resumed", (await getActiveSession(userId))?.status === "active");

  // 7. Timestamp units round-trip. The domain layer speaks epoch seconds while
  //    Mongo stores BSON Date — a missing *1000 here is invisible until the
  //    analytics page is empty, so assert it directly.
  const rawDoc = await studySessions.findOne({ _id: sessionId });
  check("startedAt stored as BSON Date", rawDoc?.startedAt instanceof Date);
  check(
    "startedAt stored at the correct instant",
    rawDoc?.startedAt.getTime() === now * 1000,
    rawDoc?.startedAt
  );
  check(
    "startedAt reads back as the same epoch seconds",
    toStudySession(rawDoc!).startedAt === now
  );

  // 8. Finish both sessions
  await studySessions.updateMany(
    { _id: { $in: [sessionId, dupId] } },
    {
      $set: {
        status: "completed",
        endedAt: new Date(now * 1000),
        durationSeconds: 3600,
        updatedAt: new Date(now * 1000),
      },
    }
  );
  await studySessions.updateOne(
    { _id: sessionId },
    { $set: { outcome: "Solved problems", notes: "Solved 5 binary search variations." } }
  );
  check("No active session after finish", (await getActiveSession(userId)) === null);

  // 9. Dashboard Summary
  const summary = await getDashboardSummary(userId, new Date());
  check("Dashboard sessionCount", summary.sessionCount >= 1, summary.sessionCount);
  check("Dashboard recentSessions", summary.recentSessions.length >= 1);
  check(
    "Dashboard recent sessions are epoch seconds",
    summary.recentSessions.every((s) => Number.isInteger(s.startedAt)),
    summary.recentSessions[0]?.startedAt
  );

  // 10. Subject Analytics
  const subjectAnalytics = await getSubjectAnalytics(userId);
  check("Subject analytics contains DSA", subjectAnalytics.some((s) => s.subject === "DSA"));
  check(
    "Subject analytics percentages are sane",
    subjectAnalytics.every((s) => s.percentage >= 0 && s.percentage <= 100),
    subjectAnalytics
  );

  // 11. Topic Analytics — null/blank topics must not produce rows
  await studySessions.insertOne(
    fromStudySession({
      id: crypto.randomUUID(),
      userId,
      subject: "DBMS",
      status: "completed",
      startedAt: now,
      durationSeconds: 1800,
    })
  );
  const topicAnalytics = await getTopicAnalytics(userId);
  check(
    "Topic analytics skips sessions with no topic",
    topicAnalytics.every((t) => typeof t.topic === "string" && t.topic.length > 0),
    topicAnalytics
  );
  check(
    "Topic analytics includes Binary Search",
    topicAnalytics.some((t) => t.topic === "Binary Search")
  );

  // 12. getAllSubjects dedupes and trims
  const subjects = await getAllSubjects(userId);
  check(
    "getAllSubjects returns unique non-empty subjects",
    new Set(subjects).size === subjects.length && subjects.every(Boolean),
    subjects
  );

  // 13. Search
  const searchHits = await getSessions(userId, { search: "binary" });
  check(
    "Search is case-insensitive on topic",
    searchHits.some((s) => s.id === sessionId),
    searchHits.length
  );
  const regexSafe = await getSessions(userId, { search: ".*" });
  check("Search escapes regex metacharacters", regexSafe.length === 0, regexSafe.length);

  // 14. Daily analytics returns a full week
  const daily = await getDailyAnalytics(userId, new Date());
  check("Daily analytics returns 7 buckets", daily.length === 7);
  check(
    "Daily analytics bucket labels",
    daily.map((d) => d.dayLabel).join(",") === "Mon,Tue,Wed,Thu,Fri,Sat,Sun",
    daily.map((d) => d.dayLabel)
  );

  // 15. Get by id
  check("getSessionById finds the session", (await getSessionById(userId, sessionId))?.id === sessionId);
  check(
    "getSessionById is scoped to the user",
    (await getSessionById("someone-else", sessionId)) === null
  );

  // 16. Update Session (metadata only — duration is locked)
  await studySessions.updateOne(
    { _id: sessionId },
    { $set: { notes: "Updated notes: master binary search." } }
  );
  const updatedList = await getSessions(userId);
  check(
    "Notes updated",
    updatedList.find((s) => s.id === sessionId)?.notes === "Updated notes: master binary search."
  );

  // 17. Limit
  check("getSessions honours limit", (await getSessions(userId, { limit: 1 })).length === 1);

  // 18. Pause accounting. The anchor lives in its own `pausedAt` field, so an
  //     edit to a paused session cannot move it. Server actions are
  //     cookie-gated, so this exercises the schema contract the actions depend
  //     on rather than the actions themselves.
  const pausedAtEpoch = now - 120;
  const pausedDoc = toStudySession({
    _id: "pause-fixture",
    userId,
    subject: "DSA",
    topic: null,
    startedAt: new Date((now - 600) * 1000),
    endedAt: null,
    durationSeconds: 0,
    pausedSeconds: 30,
    status: "paused",
    pausedAt: new Date(pausedAtEpoch * 1000),
    outcome: null,
    goal: null,
    notes: null,
    createdAt: new Date((now - 600) * 1000),
    // Edited 90s into the pause: the exact write that used to move the anchor.
    updatedAt: new Date((pausedAtEpoch + 90) * 1000),
  });

  check(
    "pausedAt round-trips as epoch seconds",
    pausedDoc.pausedAt === pausedAtEpoch,
    pausedDoc.pausedAt
  );
  check(
    "Pause anchor survives an edit made mid-pause",
    pauseAnchorSeconds(pausedDoc) === pausedAtEpoch,
    pauseAnchorSeconds(pausedDoc)
  );
  check(
    "A completed session has no pause anchor",
    pauseAnchorSeconds({ status: "completed", pausedAt: null, updatedAt: 999 }) === null
  );
  check(
    "A legacy paused document without pausedAt still resolves an anchor",
    pauseAnchorSeconds({ status: "paused", pausedAt: null, updatedAt: 999 }) === 999
  );
  check(
    "fromStudySession defaults pausedAt to null",
    fromStudySession({ id: "x", userId, subject: "DSA", startedAt: now }).pausedAt ===
      null
  );
  check(
    "toUpdateDoc converts pausedAt to a BSON Date",
    toUpdateDoc({ pausedAt: 1700000000 }).pausedAt instanceof Date &&
      toUpdateDoc({ pausedAt: 1700000000 }).pausedAt?.getTime() === 1700000000000
  );
  check(
    "toUpdateDoc clears pausedAt with null",
    toUpdateDoc({ pausedAt: null }).pausedAt === null
  );

  // 19. Timezone-correct day bucketing. The instant below is Monday 20:00 UTC,
  //     Monday 16:00 in New York, and TUESDAY 01:30 in Kolkata — three
  //     different days for the same session, all inside the same Mon-Sun week.
  //     Bucketing by UTC while the bounds were local is what made the minutes
  //     land on the wrong bar, or fall outside the range and vanish.
  const zonedInstant = Math.floor(
    new Date("2026-09-21T20:00:00Z").getTime() / 1000
  );
  const zonedId = crypto.randomUUID();
  await studySessions.insertOne(
    fromStudySession({
      id: zonedId,
      userId,
      subject: "Timezone Probe",
      topic: "Buckets",
      status: "completed",
      startedAt: zonedInstant,
      endedAt: zonedInstant,
      durationSeconds: 600,
      createdAt: zonedInstant,
      updatedAt: zonedInstant,
    })
  );

  const probeRef = new Date("2026-09-23T12:00:00Z");
  const bucketFor = async (timeZone: string, dayIndex: number) => {
    const range = getWeekRange(probeRef, timeZone);
    const daily = await getDailyAnalytics(userId, probeRef, timeZone);
    return daily.find((d) => d.date === range.dates[dayIndex]);
  };

  const utcMonday = await bucketFor("UTC", 0);
  check("UTC files the probe session on Monday", (utcMonday?.durationSeconds ?? 0) >= 600, utcMonday);

  const nyMonday = await bucketFor("America/New_York", 0);
  check(
    "New York files the same session on Monday",
    (nyMonday?.durationSeconds ?? 0) >= 600,
    nyMonday
  );

  const kolkataMonday = await bucketFor("Asia/Kolkata", 0);
  const kolkataTuesday = await bucketFor("Asia/Kolkata", 1);
  check(
    "Kolkata files the same session on Tuesday, not Monday",
    (kolkataTuesday?.durationSeconds ?? 0) >= 600 &&
      kolkataMonday?.durationSeconds === 0,
    { monday: kolkataMonday?.durationSeconds, tuesday: kolkataTuesday?.durationSeconds }
  );

  const kolkataWeek = getWeekRange(probeRef, "Asia/Kolkata");
  check(
    "Weekly range is Mon-Sun in the user's zone",
    kolkataWeek.dates[0] === "2026-09-21" && kolkataWeek.dates[6] === "2026-09-27",
    kolkataWeek.dates
  );
  check(
    "Every zone's weekly range contains the session",
    ["UTC", "America/New_York", "Asia/Kolkata", "Pacific/Kiritimati", "Asia/Kathmandu"].every(
      (tz) => {
        const w = getWeekRange(probeRef, tz);
        return zonedInstant >= w.from && zonedInstant <= w.to;
      }
    )
  );
  check(
    "Every zone's Monday bucket key matches its range start",
    ["UTC", "America/New_York", "Asia/Kolkata", "Australia/Lord_Howe", "Pacific/Chatham"].every(
      (tz) => {
        const w = getWeekRange(probeRef, tz);
        return formatDateInZone(new Date(w.from * 1000), tz) === w.dates[0];
      }
    )
  );

  const kolkataDay = getDayRange(probeRef, "Asia/Kolkata");
  check(
    "Day range spans a whole local day in a fixed-offset zone",
    kolkataDay.to - kolkataDay.from === 86399,
    kolkataDay
  );
  const springForward = getDayRange(
    new Date("2026-03-08T18:00:00Z"),
    "America/New_York"
  );
  check(
    "Day range is 23h on a spring-forward day, not a flat 24h",
    springForward.to - springForward.from + 1 === 23 * 3600,
    springForward
  );

  // 20. Subject and topic analytics honour the same window as the chart. These
  //     panels sit under a "This Week" header, so an all-time range there is how
  //     the cards above them and the panels below them ended up describing
  //     different datasets.
  const oldId = crypto.randomUUID();
  const oldInstant = Math.floor(new Date("2025-01-15T12:00:00Z").getTime() / 1000);
  await studySessions.insertOne(
    fromStudySession({
      id: oldId,
      userId,
      subject: "Paleontology",
      topic: "Fossils",
      status: "completed",
      startedAt: oldInstant,
      endedAt: oldInstant,
      durationSeconds: 999,
      createdAt: oldInstant,
      updatedAt: oldInstant,
    })
  );

  const week = getWeekRange(probeRef, "UTC");
  const weekRange = { from: week.from, to: week.to };

  check(
    "All-time subject analytics includes the old session",
    (await getSubjectAnalytics(userId)).some((s) => s.subject === "Paleontology")
  );
  const weekSubjects = await getSubjectAnalytics(userId, weekRange);
  check(
    "Week-scoped subject analytics excludes it",
    !weekSubjects.some((s) => s.subject === "Paleontology"),
    weekSubjects.map((s) => s.subject)
  );
  check(
    "Week-scoped topic analytics excludes it",
    !(await getTopicAnalytics(userId, weekRange)).some((t) => t.topic === "Fossils")
  );
  check(
    "All-time topic analytics includes it",
    (await getTopicAnalytics(userId)).some((t) => t.topic === "Fossils")
  );

  // The probe session is inside the week, so the panels and the chart now
  // describe the same set of sessions.
  check(
    "Week-scoped subject analytics includes the in-week probe",
    weekSubjects.some((s) => s.subject === "Timezone Probe")
  );
  const weekTotal = weekSubjects.reduce((sum, s) => sum + s.durationSeconds, 0);
  const weekChartTotal = (await getDailyAnalytics(userId, probeRef, "UTC")).reduce(
    (sum, d) => sum + d.durationSeconds,
    0
  );
  check(
    "Subject panel total matches the weekly chart total",
    weekTotal === weekChartTotal,
    { weekTotal, weekChartTotal }
  );

  // 21. Sort stability for equal totals. Two subjects with the same duration
  //     must not swap between page loads.
  const tieIds: string[] = [];
  for (const subject of ["Tie Bravo", "Tie Alpha"]) {
    const id = crypto.randomUUID();
    tieIds.push(id);
    await studySessions.insertOne(
      fromStudySession({
        id,
        userId,
        subject,
        status: "completed",
        startedAt: week.from + 60,
        durationSeconds: 777,
      })
    );
  }
  const firstRead = (await getSubjectAnalytics(userId, weekRange))
    .filter((s) => s.subject.startsWith("Tie "))
    .map((s) => s.subject);
  const secondRead = (await getSubjectAnalytics(userId, weekRange))
    .filter((s) => s.subject.startsWith("Tie "))
    .map((s) => s.subject);
  check(
    "Equal durations order alphabetically and stay put",
    firstRead.join("|") === "Tie Alpha|Tie Bravo" &&
      secondRead.join("|") === firstRead.join("|"),
    { firstRead, secondRead }
  );
  await studySessions.deleteMany({ _id: { $in: tieIds } });

  // 22. Subject identity. "Python", "python" and "  pYtHoN  " are ONE subject:
  //     one entry in the list, one analytics row carrying the summed time, and
  //     a filter that matches any of the spellings. What the user reads keeps
  //     their own casing, so the display is the most recent spelling rather than
  //     a lowercased one — "DSA" must not come back as "Dsa".
  const caseIds: string[] = [];
  const spellings = [
    { subject: "  pYtHoN  ", topic: "Recursion", seconds: 100, offset: 30 },
    { subject: "python", topic: "recursion", seconds: 300, offset: 60 },
    { subject: "Python", topic: "Recursion", seconds: 600, offset: 90 },
  ];
  for (const { subject, topic, seconds, offset } of spellings) {
    const id = crypto.randomUUID();
    caseIds.push(id);
    await studySessions.insertOne(
      fromStudySession({
        id,
        userId,
        subject,
        topic,
        status: "completed",
        startedAt: week.from + offset,
        endedAt: week.from + offset,
        durationSeconds: seconds,
      })
    );
  }

  // A subject whose characters are regex metacharacters, to prove the filter
  // escapes rather than interpolates.
  const metacharId = crypto.randomUUID();
  caseIds.push(metacharId);
  await studySessions.insertOne(
    fromStudySession({
      id: metacharId,
      userId,
      subject: "C++",
      status: "completed",
      startedAt: week.from + 120,
      durationSeconds: 60,
    })
  );

  const listedSubjects = await getAllSubjects(userId);
  const pythonEntries = listedSubjects.filter((s) => s.toLowerCase() === "python");
  check(
    "Subject list has one entry per case-insensitive subject",
    pythonEntries.length === 1,
    listedSubjects
  );
  check(
    "The entry keeps the most recent spelling the user typed",
    pythonEntries[0] === "Python",
    pythonEntries
  );

  const mergedAnalytics = await getSubjectAnalytics(userId, weekRange);
  const pythonRows = mergedAnalytics.filter((s) => s.subject.toLowerCase() === "python");
  check("Analytics merges the spellings into one row", pythonRows.length === 1, pythonRows);
  check(
    "The merged row sums the time of every spelling",
    pythonRows[0]?.durationSeconds === 1000,
    pythonRows[0]
  );
  check(
    "The merged row counts every session",
    pythonRows[0]?.sessionCount === 3,
    pythonRows[0]
  );

  const mergedTopics = (await getTopicAnalytics(userId, weekRange)).filter(
    (t) => t.subject.toLowerCase() === "python"
  );
  check(
    "Topic analytics merges case-variant topics under one subject row",
    mergedTopics.length === 1 && mergedTopics[0]?.durationSeconds === 1000,
    mergedTopics
  );

  const matchesPython = async (subject: string) =>
    (await getSessions(userId, { subject })).filter((s) => caseIds.includes(s.id)).length;
  check("Subject filter matches a different casing", (await matchesPython("PYTHON")) === 3);
  check("Subject filter ignores surrounding whitespace", (await matchesPython("  python ")) === 3);
  check("Subject filter is anchored, not a prefix match", (await matchesPython("Pyth")) === 0);
  check("Subject filter escapes regex metacharacters", (await matchesPython("C++")) === 1);
  check("A bare metacharacter does not match the whole subject", (await matchesPython("C")) === 0);

  // 23. Why the update action tests `matchedCount` and not `modifiedCount`.
  //     Saving an edit where nothing actually changed is a real, owned, present
  //     session and it reports modifiedCount 0 — treating that as "not found"
  //     would break the most ordinary edit in the app.
  const ownedId = caseIds[caseIds.length - 1];
  const noOpWrite = await studySessions.updateOne(
    { _id: ownedId, userId },
    { $set: { subject: "C++" } }
  );
  check(
    "A no-op write still counts as matched",
    noOpWrite.matchedCount === 1 && noOpWrite.modifiedCount === 0,
    { matched: noOpWrite.matchedCount, modified: noOpWrite.modifiedCount }
  );
  const missingWrite = await studySessions.updateOne(
    { _id: "does-not-exist", userId },
    { $set: { subject: "C++" } }
  );
  check(
    "A write against a missing row matches nothing",
    missingWrite.matchedCount === 0,
    missingWrite.matchedCount
  );
  const foreignWrite = await studySessions.updateOne(
    { _id: ownedId, userId: "someone-else" },
    { $set: { subject: "Hijacked" } }
  );
  check(
    "A write scoped to another user matches nothing",
    foreignWrite.matchedCount === 0,
    foreignWrite.matchedCount
  );
  await studySessions.deleteMany({ _id: { $in: caseIds } });

  // 24. The calendar heatmap. A year is a different query on a different range
  //     from the week-scoped panels above it, and it has three properties the
  //     week view has no chance to expose: a 364-cell grid, a boundary that
  //     moves with the day, and a range far enough back that a session from
  //     last month has to appear without anyone asking for it. So it runs here,
  //     while the probe sessions it depends on still exist.
  const heatmapRef = new Date("2026-09-23T12:00:00Z");
  const heatmap = getHeatmapRange(heatmapRef, "UTC", HEATMAP_WEEKS);
  const flatDays = heatmap.columns.flat();

  check(
    "Heatmap is 52 week columns of 7 days",
    heatmap.columns.length === HEATMAP_WEEKS &&
      heatmap.columns.every((w) => w.length === 7),
    { columns: heatmap.columns.length }
  );
  check(
    "Every heatmap column starts on a Monday",
    heatmap.columns.every((w) => new Date(`${w[0]}T00:00:00Z`).getUTCDay() === 1),
    heatmap.columns[0][0]
  );
  check(
    "Consecutive heatmap columns are contiguous, with no gap or overlap",
    heatmap.columns.every((week, i) => {
      if (i === 0) return true;
      const next = new Date(`${heatmap.columns[i - 1][6]}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      return week[0] === next.toISOString().slice(0, 10);
    })
  );
  // A year of keys built with a fixed 86400s step drifts across DST and loses
  // Feb 29, which would shear the grid by a row and drop a day of real history.
  check(
    "A year of heatmap columns has no duplicated or skipped days",
    new Set(flatDays).size === HEATMAP_WEEKS * 7
  );
  // The last column is a whole Mon-Sun week, so it extends past `today`. Those
  // trailing cells are what the component paints invisible, and the range `to`
  // is what stops a forward-dated session from landing in one of them.
  check(
    "The last column is a full week that contains today and continues past it",
    heatmap.today === "2026-09-23" &&
      heatmap.columns[HEATMAP_WEEKS - 1][0] <= heatmap.today &&
      heatmap.columns[HEATMAP_WEEKS - 1][6] > heatmap.today,
    { today: heatmap.today, last: heatmap.columns[HEATMAP_WEEKS - 1][6] }
  );
  check(
    "The heatmap range ends at the end of today, not the end of the week",
    heatmap.to === getDayRange(heatmapRef, "UTC").to
  );
  check(
    "The heatmap range reaches back a full 52 weeks",
    heatmap.from <= week.from &&
      heatmap.to - heatmap.from > 350 * 24 * 3600,
    { days: Math.round((heatmap.to - heatmap.from) / 86400) }
  );
  check(
    "Days after today are distinguishable from days with no data",
    (() => {
      const last = heatmap.columns[HEATMAP_WEEKS - 1];
      const future = last.filter((d) => d > heatmap.today);
      // Every day from tomorrow to the end of the current week, and no more.
      return (
        future.length > 0 &&
        future[0] === "2026-09-24" &&
        future[future.length - 1] === last[6] &&
        last.filter((d) => d <= heatmap.today).length === 3
      );
    })(),
    heatmap.columns[HEATMAP_WEEKS - 1]
  );
  check(
    "The heatmap range is the same shape in every zone, DST included",
    ["UTC", "America/New_York", "Asia/Kolkata", "Pacific/Kiritimati", "Pacific/Chatham"].every(
      (tz) => {
        const h = getHeatmapRange(heatmapRef, tz, HEATMAP_WEEKS);
        return (
          h.columns.length === HEATMAP_WEEKS &&
          h.to === getDayRange(heatmapRef, tz).to &&
          new Set(h.columns.flat()).size === HEATMAP_WEEKS * 7
        );
      }
    )
  );

  // Two fixtures: one from a month ago (in the year, outside the week) and one
  // that shares a day with the probe, to prove same-day sessions aggregate.
  const monthOldId = crypto.randomUUID();
  const monthOldInstant = Math.floor(
    new Date("2026-08-10T12:00:00Z").getTime() / 1000
  );
  const sameDayId = crypto.randomUUID();
  await studySessions.insertMany([
    fromStudySession({
      id: monthOldId,
      userId,
      subject: "Heatmap Probe",
      status: "completed",
      startedAt: monthOldInstant,
      durationSeconds: 5400,
    }),
    fromStudySession({
      id: sameDayId,
      userId,
      subject: "Heatmap Probe",
      status: "completed",
      startedAt: Math.floor(new Date("2026-09-21T09:00:00Z").getTime() / 1000),
      durationSeconds: 1800,
    }),
  ]);

  const heatmapRange = { from: heatmap.from, to: heatmap.to };
  const heatmapRows = await getHeatmapAnalytics(userId, heatmapRange, "UTC");

  check(
    "The heatmap shows a session from a month ago that the week view cannot",
    (heatmapRows.find((r) => r.date === "2026-08-10")?.durationSeconds ?? 0) >= 5400,
    heatmapRows.map((r) => r.date)
  );
  check(
    "The week range hides that same session from the heatmap",
    !(await getHeatmapAnalytics(userId, weekRange, "UTC")).some(
      (r) => r.date === "2026-08-10"
    )
  );
  check(
    "Two sessions on one day collapse into a single summed row",
    (() => {
      const day = heatmapRows.find((r) => r.date === "2026-09-21");
      // 600s probe + 1800s same-day fixture, in one row.
      return day !== undefined && day.sessionCount === 2 && day.durationSeconds === 2400;
    })(),
    heatmapRows.find((r) => r.date === "2026-09-21")
  );
  // Sparse by design: the component looks days up in a Map and paints a miss as
  // the absent swatch, so shipping 364 mostly-zero rows would be pure payload.
  check(
    "The heatmap is sparse — only days with focus time come back",
    heatmapRows.every((r) => r.durationSeconds > 0) &&
      heatmapRows.length < HEATMAP_WEEKS * 7,
    heatmapRows.length
  );
  check(
    "Heatmap rows come back in date order, so the grid never shuffles",
    heatmapRows.every((r, i) => i === 0 || r.date > heatmapRows[i - 1].date)
  );
  check(
    "A zero-duration completed session paints no day",
    await (async () => {
      const zeroId = crypto.randomUUID();
      await studySessions.insertOne(
        fromStudySession({
          id: zeroId,
          userId,
          subject: "Heatmap Probe",
          status: "completed",
          startedAt: Math.floor(new Date("2026-08-11T12:00:00Z").getTime() / 1000),
          durationSeconds: 0,
        })
      );
      const rows = await getHeatmapAnalytics(userId, heatmapRange, "UTC");
      return !rows.some((r) => r.date === "2026-08-11");
    })()
  );

  // Zone sensitivity. The 20:00-UTC probe is Monday in New York and Tuesday in
  // Kolkata, and the heatmap has to file it exactly the way the week chart does —
  // same instant, same day boundary, or a year of history is misfiled.
  // Zone sensitivity. The two probe sessions are 11h apart in UTC (09:00 and
  // 20:00). Both fall on 2026-09-21 in UTC and in New York, so they merge into
  // one 2400s cell. In Kolkata the 20:00 one is 01:30 the NEXT day, so the
  // local day boundary splits them across two cells. That split is the point:
  // the heatmap has to redraw history the same way the week chart does, not
  // once at UTC and then again everywhere else.
  const nyRows = await getHeatmapAnalytics(userId, heatmapRange, "America/New_York");
  const nyMap = Object.fromEntries(nyRows.map((r) => [r.date, r.durationSeconds]));
  const kolkataRows = await getHeatmapAnalytics(userId, heatmapRange, "Asia/Kolkata");
  const kolkataMap = Object.fromEntries(
    kolkataRows.map((r) => [r.date, r.durationSeconds])
  );

  check(
    "New York merges both probes onto Monday 2026-09-21",
    nyMap["2026-09-21"] === 2400 && nyMap["2026-09-22"] === undefined,
    { mon: nyMap["2026-09-21"], tue: nyMap["2026-09-22"] }
  );
  check(
    "Kolkata splits them across the local day boundary, 1800 then 600",
    kolkataMap["2026-09-21"] === 1800 && kolkataMap["2026-09-22"] === 600,
    { mon: kolkataMap["2026-09-21"], tue: kolkataMap["2026-09-22"] }
  );
  // Redistribution, never loss: whichever way the boundary falls, the same 2400
  // seconds of focus have to be on the grid.
  check(
    "Day bucketing redistributes the same total in every zone, never drops it",
    [nyRows, kolkataRows, heatmapRows].every(
      (rows) =>
        rows
          .filter((r) => r.date === "2026-09-21" || r.date === "2026-09-22")
          .reduce((sum, r) => sum + r.durationSeconds, 0) === 2400
    )
  );
  check(
    "Every heatmap row lands on a date the grid actually draws",
    ["UTC", "America/New_York", "Asia/Kolkata", "Pacific/Kiritimati", "Pacific/Chatham"]
      .length > 0 &&
      (await Promise.all(
        ["UTC", "America/New_York", "Asia/Kolkata", "Pacific/Kiritimati", "Pacific/Chatham"].map(
          (tz) => getHeatmapAnalytics(userId, heatmapRange, tz)
        )
      )).every((rows) =>
        rows.every((r) => flatDays.includes(r.date) && r.date <= heatmap.today)
      )
  );

  // The colour scale. Fixed hour thresholds, not quantiles of the user's own
  // distribution: one 14-hour day would otherwise pull the top quartile up far
  // enough to flatten a solid 3-hour day into the bottom bucket, and the scale
  // would quietly mean something different depending on the user's worst day.
  check("Zero and negative durations fall to the absent swatch", getHeatmapLevel(0) === 0 && getHeatmapLevel(-10) === 0);
  check("A NaN duration falls to the absent swatch rather than throwing", getHeatmapLevel(NaN) === 0);
  check("Level 1 is under an hour", getHeatmapLevel(1) === 1 && getHeatmapLevel(3599) === 1);
  check("Level 2 is 1h up to 2h", getHeatmapLevel(3600) === 2 && getHeatmapLevel(7199) === 2);
  check("Level 3 is 2h up to 4h", getHeatmapLevel(7200) === 3 && getHeatmapLevel(14399) === 3);
  check("Level 4 is 4h and up, with no ceiling", getHeatmapLevel(14400) === 4 && getHeatmapLevel(86400) === 4);
  check(
    "A single outlier does not compress a normal day",
    getHeatmapLevel(3 * 3600) === 3 && getHeatmapLevel(14 * 3600) === 4
  );
  check(
    "The scale is monotonic, covers every level, and labels each one",
    HEATMAP_LEVELS.map((l) => l.level).join(",") === "0,1,2,3,4" &&
      HEATMAP_LEVELS.every((l) => l.className.length > 0 && l.label.length > 0) &&
      getHeatmapLevel(0) < getHeatmapLevel(3600) &&
      getHeatmapLevel(3600) < getHeatmapLevel(7200) &&
      getHeatmapLevel(7200) < getHeatmapLevel(14400)
  );
  // Tailwind's scanner reads the source, so a `bg-emerald-${i}` literal here
  // would compile fine and render as no colour at all.
  check(
    "Every swatch class is a literal Tailwind class, not an interpolated one",
    HEATMAP_LEVELS.every((l) => !l.className.includes("${"))
  );

  await studySessions.deleteMany({ _id: { $in: [monthOldId, sameDayId] } });
  await studySessions.deleteMany({
    userId,
    subject: "Heatmap Probe",
  });
  await studySessions.deleteOne({ _id: zonedId });
  await studySessions.deleteOne({ _id: oldId });

  // 24. Delete Session
  await studySessions.deleteOne({ _id: sessionId });
  check("Session deleted", (await getSessionById(userId, sessionId)) === null);

  // 25. The stopwatch state machine. This is the whole timing core of the app
  //     and it was untested while it was a three-line function inside a server
  //     action; the properties below are the ones the reported bugs were, so they
  //     are asserted directly rather than inferred from a round trip.
  const sw = startSegment(freshStopwatch(), 0);
  check("A fresh stopwatch is zero and not running", !isRunning(freshStopwatch()) && stopwatchElapsedMs(freshStopwatch(), 5_000) === 0);
  check("A running stopwatch is running", isRunning(sw));

  // The defining property: elapsed is a function of `now` and the anchors, not of
  // how often it was read. This is what a tab throttled to 1Hz — or fully
  // suspended — depends on, and what a `setState(elapsed + 100)` design cannot do.
  let at10Hz = 0;
  for (let t = 100; t <= 30_000; t += 100) at10Hz = stopwatchElapsedMs(sw, t);
  let at1Hz = 0;
  for (let t = 1_000; t <= 30_000; t += 1_000) at1Hz = stopwatchElapsedMs(sw, t);
  let throttled = 0;
  for (const t of [1_000, 20_000, 30_000]) throttled = stopwatchElapsedMs(sw, t);
  check(
    "Elapsed is identical at 10Hz, 1Hz, and with three ticks in 30s",
    at10Hz === 30_000 && at1Hz === 30_000 && throttled === 30_000,
    { at10Hz, at1Hz, throttled }
  );

  // Pause freezes, resume continues from exactly where it stopped.
  const swPaused = pauseSegment(sw, 12_000);
  check(
    "Pause freezes the number no matter how long it stays paused",
    stopwatchElapsedMs(swPaused, 12_000) === 12_000 &&
      stopwatchElapsedMs(swPaused, 999_000) === 12_000,
    stopwatchElapsedMs(swPaused, 999_000)
  );
  const swResumed = startSegment(swPaused, 20_000);
  check(
    "Resume continues from the banked value, not from zero",
    stopwatchElapsedMs(swResumed, 25_000) === 17_000,
    stopwatchElapsedMs(swResumed, 25_000)
  );
  check(
    "Pausing twice does not bank the same interval twice",
    stopwatchElapsedMs(pauseSegment(swPaused, 50_000), 50_000) === 12_000,
    stopwatchElapsedMs(pauseSegment(swPaused, 50_000), 50_000)
  );
  const beforeRestart = stopwatchElapsedMs(swResumed, 30_000);
  check(
    "Starting twice is a no-op",
    stopwatchElapsedMs(startSegment(swResumed, 30_000), 30_000) === beforeRestart &&
      beforeRestart === 22_000,
    { beforeRestart }
  );

  // The reload case. A running session is checkpointed against the wall clock,
  // then restored in a NEW document where `performance.now()` restarts near zero.
  const T0 = 1_700_000_000_000;
  const running = startSegment(freshStopwatch(), 5_000);
  const checkpoint = serializeStopwatch(running, 5_000, T0);
  check(
    "Checkpointing a running stopwatch records a wall-clock anchor",
    checkpoint.status === "running" && checkpoint.segmentStartedAtEpochMs === T0,
    checkpoint
  );
  // 90s pass, then the tab reloads. Under the old design this read a monotonic
  // clock of ~120 against a segment start of 5000, clamped to zero, and the
  // timer visibly restarted.
  const restored = restoreStopwatch(checkpoint, T0 + 90_000, 120);
  check(
    "A reload does not reset the timer",
    stopwatchElapsedMs(restored, 120) === 90_000,
    stopwatchElapsedMs(restored, 120)
  );
  check(
    "After a restore the display is measured monotonically again, so a system clock jump cannot move it",
    stopwatchElapsedMs(restored, 120 + 60_000) === 150_000,
    stopwatchElapsedMs(restored, 120 + 60_000)
  );
  const futureAnchor = restoreStopwatch(
    { status: "running", accumulatedMs: 0, segmentStartedAtEpochMs: T0 + 60_000 },
    T0,
    0
  );
  check(
    "A checkpoint anchored in the future does not produce a negative timer",
    stopwatchElapsedMs(futureAnchor, 0) === 0,
    stopwatchElapsedMs(futureAnchor, 0)
  );

  const pausedCheckpoint = serializeStopwatch(swPaused, 20_000, T0);
  check(
    "Checkpointing a paused stopwatch records no anchor",
    pausedCheckpoint.status === "paused" &&
      pausedCheckpoint.segmentStartedAtEpochMs === null &&
      pausedCheckpoint.accumulatedMs === 12_000,
    pausedCheckpoint
  );
  const restoredPaused = restoreStopwatch(pausedCheckpoint, T0 + 3_600_000, 42);
  check(
    "A paused session stays paused across a reload, with the number intact",
    restoredPaused.status === "paused" &&
      stopwatchElapsedMs(restoredPaused, 42) === 12_000,
    stopwatchElapsedMs(restoredPaused, 42)
  );

  // A run/pause/run cycle, then a reload. Both segments have to survive, which
  // is what a single anchor or a naive `now - startedAt` cannot do.
  let cycled = startSegment(freshStopwatch(), 0);
  cycled = pauseSegment(cycled, 10_000);
  cycled = startSegment(cycled, 15_000);
  const cycleCheckpoint = serializeStopwatch(cycled, 20_000, T0);
  check(
    "A run/pause/run cycle checkpoints the closed segment and the open one",
    cycleCheckpoint.accumulatedMs === 10_000 &&
      cycleCheckpoint.segmentStartedAtEpochMs === T0 - 5_000,
    cycleCheckpoint
  );
  const cycleRestored = restoreStopwatch(cycleCheckpoint, T0 + 30_000, 10);
  check(
    "A session with a pause in it survives a reload with both segments",
    stopwatchElapsedMs(cycleRestored, 10) === 45_000,
    stopwatchElapsedMs(cycleRestored, 10)
  );

  // A reload while paused, then resumed: the closed banked time plus the segment
  // opened after the reload.
  const reopened = startSegment(restoredPaused, 100);
  check(
    "Resuming after a paused reload continues from the banked value",
    stopwatchElapsedMs(reopened, 3_100) === 15_000,
    stopwatchElapsedMs(reopened, 3_100)
  );

  // `localStorage` is user-writable, so an unrecognisable checkpoint has to be
  // refused rather than rendered as NaN.
  check(
    "Unrecognisable checkpoints are rejected",
    parsePersistedStopwatch(null) === null &&
      parsePersistedStopwatch("nope") === null &&
      parsePersistedStopwatch({}) === null &&
      parsePersistedStopwatch({ status: "running" }) === null
  );
  check(
    "A checkpoint with a negative banked value is rejected",
    parsePersistedStopwatch({
      status: "paused",
      accumulatedMs: -5,
      segmentStartedAtEpochMs: null,
    }) === null
  );
  const anchorless = parsePersistedStopwatch({
    status: "running",
    accumulatedMs: 1_000,
    segmentStartedAtEpochMs: null,
  });
  check(
    "A running checkpoint with no anchor degrades to paused rather than NaN",
    anchorless !== null &&
      restoreStopwatch(anchorless, T0, 0).status === "paused" &&
      stopwatchElapsedMs(restoreStopwatch(anchorless, T0, 0), 0) === 1_000
  );

  check(
    "The display floors to whole seconds",
    formatTimerDisplay(5076.9) === "01:24:36",
    formatTimerDisplay(5076.9)
  );

  // 25b. The reconcile fast path. Skipping the reconcile is an optimisation, and
  //      the one thing it must never skip is dropping a local record the server
  //      no longer has. `null` is ambiguous between "nothing is open" and "the
  //      row we were holding is gone", and treating the two the same left a timer
  //      counting against a deleted session with no way to clear it short of a
  //      full page reload.
  check(
    "An unchanged remote row skips the reconcile",
    canSkipReconcile("abc", "abc", true) === true
  );
  check(
    "A changed remote row does not skip the reconcile",
    canSkipReconcile("abc", "def", true) === false
  );
  check(
    "A first reconcile against no session does not skip",
    canSkipReconcile(undefined, null, false) === false
  );
  check(
    "Reconciling a local record away from no-session does not skip",
    canSkipReconcile(null, null, true) === false
  );
  check(
    "No local record and no remote session is the one skippable null case",
    canSkipReconcile(null, null, false) === true
  );

  // 26. The start instant. The client owns it, so a wrong system clock is the one
  //     thing that can still file a session under the wrong day.
  check("A plausible client start instant is kept", resolveStartedAt(T0 / 1000 - 30, T0 / 1000) === T0 / 1000 - 30);
  check("A client that sends nothing gets the server's clock", resolveStartedAt(undefined, T0 / 1000) === T0 / 1000);
  check(
    "A client start instant too far in the future falls back to the server's",
    resolveStartedAt(T0 / 1000 + MAX_START_SKEW_SECONDS + 1, T0 / 1000) === T0 / 1000
  );
  check(
    "A client start instant too far in the past falls back to the server's",
    resolveStartedAt(T0 / 1000 - 8 * 24 * 60 * 60, T0 / 1000) === T0 / 1000
  );

  // Cleanup remaining fixture data
  await studySessions.deleteMany({ userId });

  console.log("\n=================================");
  if (failures > 0) {
    console.error(`✗ ${failures} CHECK(S) FAILED`);
    console.log("=================================\n");
    process.exit(1);
  }
  console.log("ALL TESTS & CHECKS PASSED");
  console.log("=================================\n");

  // Without this the script never exits: the driver's connection pool is still
  // open, so a PASSING run hangs until something kills it. Which also means
  // `npm run test:e2e` has never been usable in CI, since CI waits for the exit
  // code it can never receive.
  await client.close();
}

runVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  });
