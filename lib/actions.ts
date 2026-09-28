"use server";

import { MongoServerError } from "mongodb";
import { studySessions } from "@/db";
import {
  fromStudySession,
  pauseAnchorSeconds,
  toStudySession,
  toUpdateDoc,
  type NewStudySession,
  type StudySession,
} from "@/db/schema";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MAX_START_SKEW_SECONDS, resolveStartedAt } from "./timer";
import { getUserId } from "./session";
import { normalizeSubject } from "./subjects";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // No-op outside Next.js request context (e.g. testing)
  }
}

export type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

const UNAUTHORIZED = { success: false, error: "UNAUTHORIZED" } as const;

/** Duplicate key — the active_session_uniq partial unique index firing. */
function isDuplicateKeyError(err: unknown): boolean {
  return err instanceof MongoServerError && err.code === 11000;
}

// `.trim()` is zod's own transform, so a whitespace-only subject still fails
// `.min(1)`. The extra `normalizeSubject` collapses internal whitespace runs:
// without it a pasted "Data  Structures" and a typed "Data Structures" are two
// subjects, and the subject filter and analytics rows fork with them.
const subjectField = z
  .string()
  .trim()
  .min(1, "Subject is required")
  .max(100)
  .transform(normalizeSubject);

const createSessionSchema = z.object({
  subject: subjectField,
  topic: z.string().trim().max(200).optional(),
  goal: z.string().trim().max(300).optional(),
  // Epoch SECONDS, from the user's own clock, captured when they pressed start.
  // See `resolveStartedAt` in `lib/timer.ts` for why the client gets to own this.
  startedAt: z.number().int().nonnegative().optional(),
});

const finishSessionSchema = z.object({
  outcome: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  // Focused seconds, measured and floored by the client so the stored number is
  // exactly the one the user watched count up to. Optional so that a client
  // which sends nothing still lands a coherent row.
  durationSeconds: z.number().int().nonnegative().optional(),
  pausedSeconds: z.number().int().nonnegative().optional(),
});

const updateSessionSchema = z.object({
  subject: subjectField.optional(),
  topic: z.string().trim().max(200).optional(),
  goal: z.string().trim().max(300).optional(),
  outcome: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});

/**
 * Creates and begins a new study session.
 * Rejects if another session is active or paused.
 *
 * Returns the whole session, not just its id: the client seeds its own running
 * timer from this, so the timer can appear on the click instead of waiting for
 * the revalidation that follows.
 */
export async function createSession(
  input: z.infer<typeof createSessionSchema>
): Promise<ActionResult<StudySession>> {
  try {
    const userId = await getUserId();
    if (!userId) return UNAUTHORIZED;

    const validated = createSessionSchema.parse(input);

    // Fast path: the happy case never touches the index twice. The
    // active_session_uniq partial unique index is what actually enforces the
    // invariant — this SELECT is only there to return a clean error code
    // instead of surfacing E11000 on every request.
    const existingActive = await studySessions.findOne(
      { userId, status: { $in: ["active", "paused"] } },
      { projection: { _id: 1 } }
    );

    if (existingActive) {
      return {
        success: false,
        error: "ACTIVE_SESSION_EXISTS",
      };
    }

    const now = Math.floor(Date.now() / 1000);
    const startedAt = resolveStartedAt(validated.startedAt, now);
    const id = crypto.randomUUID();

    const created = fromStudySession({
      id,
      userId,
      subject: validated.subject,
      topic: validated.topic || null,
      goal: validated.goal || null,
      startedAt,
      endedAt: null,
      durationSeconds: 0,
      pausedSeconds: 0,
      status: "active",
      pausedAt: null,
      outcome: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });

    await studySessions.insertOne(created);

    safeRevalidate("/");
    return { success: true, data: toStudySession(created) };
  } catch (err: unknown) {
    // Lost the check-then-act race: the index rejected the second insert.
    if (isDuplicateKeyError(err)) {
      return { success: false, error: "ACTIVE_SESSION_EXISTS" };
    }
    if (err instanceof z.ZodError) {
      return { success: false, error: err.issues[0]?.message || "Invalid input" };
    }
    console.error("Failed to create session:", err);
    return { success: false, error: "DATABASE_ERROR" };
  }
}

/**
 * Finishes a running or paused session.
 *
 * There is one request per session in total: start and finish. Pause and resume
 * are local state and never reach this file, so the focused total comes from the
 * client, measured on the same monotonic clock the user watched it tick on.
 *
 * The row is clamped to what the wall clock can actually vouch for. That is not
 * a trust boundary — this is a personal tracker, the user is the only party, and
 * there is nothing to cheat — it is a guard on a *wrong clock*. An uncorrected
 * system clock hours out would otherwise write a nonsense duration straight into
 * the record, and from there into every daily total, every subject average, and
 * every streak the user ever looks at.
 */
export async function finishSession(
  id: string,
  input?: z.infer<typeof finishSessionSchema>
): Promise<ActionResult<{ durationSeconds: number }>> {
  try {
    const userId = await getUserId();
    if (!userId) return UNAUTHORIZED;

    const doc = await studySessions.findOne({ _id: id, userId });

    if (!doc) {
      return { success: false, error: "SESSION_NOT_FOUND" };
    }

    const session = toStudySession(doc);
    if (session.status === "completed") {
      return { success: false, error: "SESSION_ALREADY_COMPLETED" };
    }

    const validated = finishSessionSchema.parse(input || {});
    const now = Math.floor(Date.now() / 1000);
    const observedSpan = Math.max(0, now - session.startedAt);
    // Allow for plausible client-server clock skew. Because resolveStartedAt permits
    // client timestamps up to MAX_START_SKEW_SECONDS ahead of the server, a fast client
    // clock would otherwise cause observedSpan to truncate legitimately tracked focus time.
    const maxPlausibleDuration = observedSpan + MAX_START_SKEW_SECONDS;

    let finalDuration: number;
    let finalPaused: number;

    // A row that is still `paused` is a legacy one, written before the client
    // took over the clock. It carries its own anchor, so the honest totals are
    // derivable without any client input at all.
    const anchor = pauseAnchorSeconds(session);
    if (anchor !== null) {
      finalPaused = session.pausedSeconds + Math.max(0, now - anchor);
      finalDuration = Math.max(0, observedSpan - finalPaused);
    } else {
      const requestedDuration = validated.durationSeconds ?? observedSpan;
      finalDuration = Math.min(requestedDuration, maxPlausibleDuration);
      // Paused time and focused time are two slices of the same wall span.
      finalPaused = Math.max(
        0,
        Math.min(
          validated.pausedSeconds ?? session.pausedSeconds,
          maxPlausibleDuration - finalDuration
        )
      );
    }

    // endedAt is guaranteed to satisfy: startedAt <= endedAt and duration + paused <= endedAt - startedAt.
    const endedAt = Math.max(now, session.startedAt + finalDuration + finalPaused);

    await studySessions.updateOne(
      { _id: id, userId },
      {
        $set: toUpdateDoc({
          status: "completed",
          endedAt,
          durationSeconds: finalDuration,
          pausedSeconds: finalPaused,
          pausedAt: null,
          outcome: validated.outcome || null,
          notes: validated.notes || null,
          updatedAt: now,
        }),
      }
    );

    safeRevalidate("/");
    safeRevalidate("/sessions");
    safeRevalidate("/analytics");
    return { success: true, data: { durationSeconds: finalDuration } };
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.issues[0]?.message || "Invalid input" };
    }
    console.error("Failed to finish session:", err);
    return { success: false, error: "DATABASE_ERROR" };
  }
}

/**
 * Updates details on an existing session.
 */
export async function updateSession(
  id: string,
  input: z.infer<typeof updateSessionSchema>
): Promise<ActionResult> {
  try {
    const userId = await getUserId();
    if (!userId) return UNAUTHORIZED;

    const validated = updateSessionSchema.parse(input);
    const now = Math.floor(Date.now() / 1000);

    const updateData: Partial<NewStudySession> = {
      updatedAt: now,
    };

    if (validated.subject !== undefined) updateData.subject = validated.subject;
    if (validated.topic !== undefined) updateData.topic = validated.topic || null;
    if (validated.goal !== undefined) updateData.goal = validated.goal || null;
    if (validated.outcome !== undefined)
      updateData.outcome = validated.outcome || null;
    if (validated.notes !== undefined) updateData.notes = validated.notes || null;

    const result = await studySessions.updateOne(
      { _id: id, userId },
      { $set: toUpdateDoc(updateData) }
    );

    // `matchedCount`, not `modifiedCount`. Zero matched means the row is gone or
    // belongs to someone else, and the caller has to be able to tell that from
    // success. `modifiedCount` would be 0 for a save where the user changed
    // nothing — a real, owned, present session — so testing it would report
    // "not found" for the most ordinary edit in the app.
    if (result.matchedCount === 0) {
      return { success: false, error: "SESSION_NOT_FOUND" };
    }

    safeRevalidate("/");
    safeRevalidate("/sessions");
    safeRevalidate("/analytics");
    return { success: true, data: undefined };
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.issues[0]?.message || "Invalid input" };
    }
    console.error("Failed to update session:", err);
    return { success: false, error: "DATABASE_ERROR" };
  }
}

/**
 * Deletes a session permanently.
 */
export async function deleteSession(id: string): Promise<ActionResult> {
  try {
    const userId = await getUserId();
    if (!userId) return UNAUTHORIZED;

    const result = await studySessions.deleteOne({ _id: id, userId });

    // Same reasoning as updateSession: a delete that matched nothing is not a
    // delete, and the confirm dialog is about to claim that the row is gone.
    if (result.deletedCount === 0) {
      return { success: false, error: "SESSION_NOT_FOUND" };
    }

    safeRevalidate("/");
    safeRevalidate("/sessions");
    safeRevalidate("/analytics");
    return { success: true, data: undefined };
  } catch (err) {
    console.error("Failed to delete session:", err);
    return { success: false, error: "DATABASE_ERROR" };
  }
}

/**
 * Permanently deletes all study sessions (Reset data).
 */
export async function clearAllSessions(): Promise<ActionResult> {
  try {
    const userId = await getUserId();
    if (!userId) return UNAUTHORIZED;

    await studySessions.deleteMany({ userId });

    safeRevalidate("/");
    safeRevalidate("/sessions");
    safeRevalidate("/analytics");
    return { success: true, data: undefined };
  } catch (err) {
    console.error("Failed to clear all sessions:", err);
    return { success: false, error: "DATABASE_ERROR" };
  }
}
