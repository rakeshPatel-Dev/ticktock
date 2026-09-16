"use server";

import { db } from "@/db";
import { sessions } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { calculateDuration } from "./timer";

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

const createSessionSchema = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(100),
  topic: z.string().trim().max(200).optional(),
  goal: z.string().trim().max(300).optional(),
});

const finishSessionSchema = z.object({
  outcome: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const updateSessionSchema = z.object({
  subject: z.string().trim().min(1).max(100).optional(),
  topic: z.string().trim().max(200).optional(),
  goal: z.string().trim().max(300).optional(),
  outcome: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});

/**
 * Creates and begins a new study session.
 * Rejects if another session is active or paused.
 */
export async function createSession(
  input: z.infer<typeof createSessionSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const validated = createSessionSchema.parse(input);

    // Concurrency invariant: verify no active or paused session exists
    const existingActive = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(inArray(sessions.status, ["active", "paused"]))
      .limit(1);

    if (existingActive.length > 0) {
      return {
        success: false,
        error: "ACTIVE_SESSION_EXISTS",
      };
    }

    const now = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();

    await db.insert(sessions).values({
      id,
      subject: validated.subject,
      topic: validated.topic || null,
      goal: validated.goal || null,
      startedAt: now,
      endedAt: null,
      durationSeconds: 0,
      pausedSeconds: 0,
      status: "active",
      outcome: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });

    safeRevalidate("/");
    return { success: true, data: { id } };
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.issues[0]?.message || "Invalid input" };
    }
    console.error("Failed to create session:", err);
    return { success: false, error: "DATABASE_ERROR" };
  }
}

/**
 * Pauses an active session.
 */
export async function pauseSession(id: string): Promise<ActionResult> {
  try {
    const session = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);

    if (session.length === 0) {
      return { success: false, error: "SESSION_NOT_FOUND" };
    }

    if (session[0].status !== "active") {
      return { success: false, error: "INVALID_SESSION_STATE" };
    }

    const now = Math.floor(Date.now() / 1000);

    await db
      .update(sessions)
      .set({
        status: "paused",
        updatedAt: now,
      })
      .where(eq(sessions.id, id));

    safeRevalidate("/");
    return { success: true, data: undefined };
  } catch (err) {
    console.error("Failed to pause session:", err);
    return { success: false, error: "DATABASE_ERROR" };
  }
}

/**
 * Resumes a paused session.
 */
export async function resumeSession(id: string): Promise<ActionResult> {
  try {
    const sessionList = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);

    if (sessionList.length === 0) {
      return { success: false, error: "SESSION_NOT_FOUND" };
    }

    const session = sessionList[0];
    if (session.status !== "paused") {
      return { success: false, error: "INVALID_SESSION_STATE" };
    }

    const now = Math.floor(Date.now() / 1000);
    // Add the duration of this pause interval
    const pauseDelta = Math.max(0, now - session.updatedAt);
    const totalPaused = session.pausedSeconds + pauseDelta;

    await db
      .update(sessions)
      .set({
        status: "active",
        pausedSeconds: totalPaused,
        updatedAt: now,
      })
      .where(eq(sessions.id, id));

    safeRevalidate("/");
    return { success: true, data: undefined };
  } catch (err) {
    console.error("Failed to resume session:", err);
    return { success: false, error: "DATABASE_ERROR" };
  }
}

/**
 * Finishes a running or paused session.
 */
export async function finishSession(
  id: string,
  input?: z.infer<typeof finishSessionSchema>
): Promise<ActionResult> {
  try {
    const sessionList = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);

    if (sessionList.length === 0) {
      return { success: false, error: "SESSION_NOT_FOUND" };
    }

    const session = sessionList[0];
    if (session.status === "completed") {
      return { success: false, error: "SESSION_ALREADY_COMPLETED" };
    }

    const validated = finishSessionSchema.parse(input || {});
    const now = Math.floor(Date.now() / 1000);

    let finalPaused = session.pausedSeconds;
    if (session.status === "paused") {
      finalPaused += Math.max(0, now - session.updatedAt);
    }

    const finalDuration = calculateDuration(session.startedAt, now, finalPaused);

    await db
      .update(sessions)
      .set({
        status: "completed",
        endedAt: now,
        durationSeconds: finalDuration,
        pausedSeconds: finalPaused,
        outcome: validated.outcome || null,
        notes: validated.notes || null,
        updatedAt: now,
      })
      .where(eq(sessions.id, id));

    safeRevalidate("/");
    safeRevalidate("/sessions");
    safeRevalidate("/analytics");
    return { success: true, data: undefined };
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
    const validated = updateSessionSchema.parse(input);
    const now = Math.floor(Date.now() / 1000);

    const updateData: Partial<typeof sessions.$inferInsert> = {
      updatedAt: now,
    };

    if (validated.subject !== undefined) updateData.subject = validated.subject;
    if (validated.topic !== undefined) updateData.topic = validated.topic || null;
    if (validated.goal !== undefined) updateData.goal = validated.goal || null;
    if (validated.outcome !== undefined)
      updateData.outcome = validated.outcome || null;
    if (validated.notes !== undefined) updateData.notes = validated.notes || null;

    await db.update(sessions).set(updateData).where(eq(sessions.id, id));

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
    await db.delete(sessions).where(eq(sessions.id, id));

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
    await db.delete(sessions);

    safeRevalidate("/");
    safeRevalidate("/sessions");
    safeRevalidate("/analytics");
    return { success: true, data: undefined };
  } catch (err) {
    console.error("Failed to clear all sessions:", err);
    return { success: false, error: "DATABASE_ERROR" };
  }
}
