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
  getSessionById,
  getSessions,
  getSubjectAnalytics,
  getTopicAnalytics,
} from "../lib/queries";
import { formatDateInZone, getDayRange, getWeekRange } from "../lib/timezone";

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

  // 5. Pause Session
  await studySessions.updateOne(
    { _id: sessionId },
    { $set: { status: "paused", updatedAt: new Date(now * 1000) } }
  );
  check("Session paused", (await getActiveSession(userId))?.status === "paused");

  // 6. Resume Session
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

  await studySessions.deleteOne({ _id: zonedId });
  await studySessions.deleteOne({ _id: oldId });

  // 24. Delete Session
  await studySessions.deleteOne({ _id: sessionId });
  check("Session deleted", (await getSessionById(userId, sessionId)) === null);

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
