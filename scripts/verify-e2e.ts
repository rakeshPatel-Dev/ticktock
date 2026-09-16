import { db } from "../db";
import { sessions } from "../db/schema";
import {
  createSession,
  pauseSession,
  resumeSession,
  finishSession,
  updateSession,
  deleteSession,
} from "../lib/actions";
import {
  getActiveSession,
  getDashboardSummary,
  getSubjectAnalytics,
  getSessions,
} from "../lib/queries";

async function runVerification() {
  console.log("--- Starting TickTock End-to-End Verification ---");

  // Clear existing test data
  await db.delete(sessions);

  // 1. Initial State: No active session
  let active = await getActiveSession();
  console.assert(active === null, "Initial active session should be null");
  console.log("✓ Initial state clean");

  // 2. Create Session
  const createRes = await createSession({
    subject: "DSA",
    topic: "Binary Search",
    goal: "Solve 5 problems",
  });
  console.assert(createRes.success, "Failed to create session");
  if (!createRes.success) throw new Error("Create failed");
  const sessionId = createRes.data.id;
  console.log("✓ Session created with ID:", sessionId);

  // 3. Concurrency check: duplicate active session rejected
  const dupRes = await createSession({ subject: "OS" });
  console.assert(!dupRes.success, "Duplicate session should be rejected");
  if (!dupRes.success) {
    console.assert(dupRes.error === "ACTIVE_SESSION_EXISTS", "Expected ACTIVE_SESSION_EXISTS error");
  }
  console.log("✓ Concurrency protection active");

  // 4. Check active session retrieval
  active = await getActiveSession();
  console.assert(active !== null && active.id === sessionId, "Active session mismatch");
  console.assert(active?.status === "active", "Session status should be active");
  console.log("✓ Active session successfully retrieved");

  // 5. Pause Session
  const pauseRes = await pauseSession(sessionId);
  console.assert(pauseRes.success, "Pause failed");
  active = await getActiveSession();
  console.assert(active?.status === "paused", "Session status should be paused");
  console.log("✓ Session paused successfully");

  // 6. Resume Session
  const resumeRes = await resumeSession(sessionId);
  console.assert(resumeRes.success, "Resume failed");
  active = await getActiveSession();
  console.assert(active?.status === "active", "Session status should be active again");
  console.log("✓ Session resumed successfully");

  // 7. Finish Session
  const finishRes = await finishSession(sessionId, {
    outcome: "Solved problems",
    notes: "Solved 6 binary search variations.",
  });
  console.assert(finishRes.success, "Finish failed");
  active = await getActiveSession();
  console.assert(active === null, "Active session should be null after finish");
  console.log("✓ Session finished successfully");

  // 8. Verify Dashboard Summary
  const summary = await getDashboardSummary();
  console.assert(summary.sessionCount === 1, `Expected 1 session, got ${summary.sessionCount}`);
  console.assert(summary.subjectCount === 1, `Expected 1 subject, got ${summary.subjectCount}`);
  console.assert(summary.recentSessions.length === 1, "Recent session should appear");
  console.log("✓ Dashboard summary accurate");

  // 9. Verify Analytics
  const subjectAnalytics = await getSubjectAnalytics();
  console.assert(subjectAnalytics.length === 1, "Expected 1 subject in analytics");
  console.assert(subjectAnalytics[0].subject === "DSA", "Expected subject DSA");
  console.log("✓ Subject analytics accurate");

  // 10. Update Session (duration is locked — only metadata can change)
  const updateRes = await updateSession(sessionId, {
    notes: "Updated notes: master binary search.",
  });
  console.assert(updateRes.success, "Update failed");
  const updatedList = await getSessions();
  console.assert(updatedList[0].notes === "Updated notes: master binary search.", "Notes did not update");
  console.log("✓ Session updated successfully");

  // 11. Delete Session
  const deleteRes = await deleteSession(sessionId);
  console.assert(deleteRes.success, "Delete failed");
  const emptyList = await getSessions();
  console.assert(emptyList.length === 0, "Session was not deleted");
  console.log("✓ Session deleted successfully");

  console.log("\n=================================");
  console.log("🎉 ALL TESTS & CHECKS PASSED 100%");
  console.log("=================================\n");
}

runVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
