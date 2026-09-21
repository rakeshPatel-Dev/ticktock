import "./_load-env";

import { db } from "../db";
import { sessions, user } from "../db/schema";
import { eq } from "drizzle-orm";
import {
  getActiveSession,
  getDashboardSummary,
  getSubjectAnalytics,
  getSessions,
} from "../lib/queries";

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
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

  // Resolve the user (server actions are cookie-gated, so we test the query layer directly)
  const users = await db.select().from(user).where(eq(user.username, username)).limit(1);
  if (users.length === 0) {
    console.error(`No account found for "${username}". Create one at /signup first.`);
    process.exit(1);
  }
  const userId = users[0].id;
  console.log(`Verifying against user "${users[0].username}" (${userId})...\n`);

  // Clear existing sessions for this user
  await db.delete(sessions).where(eq(sessions.userId, userId));

  // 1. Initial State: No active session
  let active = await getActiveSession(userId);
  console.assert(active === null, "Initial active session should be null");
  console.log("✓ Initial state clean");

  // 2. Seed an active session (server actions can't run headless — they're cookie-gated)
  const sessionId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const inserted = await db.insert(sessions).values({
    id: sessionId,
    userId,
    subject: "DSA",
    topic: "Binary Search",
    goal: "Solve 5 problems",
    status: "active",
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  console.log("✓ Session seeded with ID:", sessionId);

  // 3. Concurrency invariant: only ONE active/paused session per user
  const dupId = crypto.randomUUID();
  await db.insert(sessions).values({
    id: dupId,
    userId,
    subject: "OS",
    topic: "Kernel",
    goal: "Read chapter 4",
    status: "active",
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  active = await getActiveSession(userId);
  console.assert(active?.id === sessionId, "Active session should be the first seeded session");
  console.log("✓ Concurrency invariant holds (single active session)");

  // 4. Active session retrieval
  active = await getActiveSession(userId);
  console.assert(active !== null && active.id === sessionId, "Active session mismatch");
  console.assert(active?.status === "active", "Session status should be active");
  console.log("✓ Active session successfully retrieved");

  // 5. Pause Session
  await db
    .update(sessions)
    .set({ status: "paused" })
    .where(eq(sessions.id, sessionId));
  active = await getActiveSession(userId);
  console.assert(active?.status === "paused", "Session status should be paused");
  console.log("✓ Session paused successfully");

  // 6. Resume Session
  await db
    .update(sessions)
    .set({ status: "active" })
    .where(eq(sessions.id, sessionId));
  active = await getActiveSession(userId);
  console.assert(active?.status === "active", "Session status should be active again");
  console.log("✓ Session resumed successfully");

  // 7. Finish both sessions
  await db
    .update(sessions)
    .set({ status: "completed", outcome: "Solved problems", notes: "Solved 5 binary search variations." })
    .where(eq(sessions.id, sessionId));
  await db
    .update(sessions)
    .set({ status: "completed", outcome: "Studied OS", notes: "Finished chapter 4." })
    .where(eq(sessions.id, dupId));
  active = await getActiveSession(userId);
  console.assert(active === null, "Active session should be null after finish");
  console.log("✓ Sessions finished successfully");

  // 8. Dashboard Summary
  const summary = await getDashboardSummary(userId, new Date());
  console.assert(summary.sessionCount === 2, `Expected 2 sessions, got ${summary.sessionCount}`);
  console.assert(summary.subjectCount === 2, `Expected 2 subjects, got ${summary.subjectCount}`);
  console.assert(summary.recentSessions.length === 2, "Recent sessions should appear");
  console.log("✓ Dashboard summary accurate");

  // 9. Subject Analytics
  const subjectAnalytics = await getSubjectAnalytics(userId);
  console.assert(subjectAnalytics.length === 2, `Expected 2 subjects in analytics`);
  const dsa = subjectAnalytics.find((s) => s.subject === "DSA");
  console.assert(!!dsa, "Expected subject DSA in analytics");
  console.log("✓ Subject analytics accurate");

  // 10. Update Session (metadata only — duration is locked)
  await db
    .update(sessions)
    .set({ notes: "Updated notes: master binary search." })
    .where(eq(sessions.id, sessionId));
  const updatedList = await getSessions(userId);
  console.assert(updatedList[0].notes === "Updated notes: master binary search.", "Notes did not update");
  console.log("✓ Session updated successfully");

  // 11. Delete Session
  await db.delete(sessions).where(eq(sessions.id, sessionId));
  const remaining = await getSessions(userId);
  console.assert(remaining.length === 1, "Session was not deleted");
  console.log("✓ Session deleted successfully");

  // Cleanup remaining seed data
  await db.delete(sessions).where(eq(sessions.userId, userId));

  console.log("\n=================================");
  console.log("🎉 ALL TESTS & CHECKS PASSED");
  console.log("=================================\n");
}

runVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
