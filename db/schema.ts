/**
 * Hand-written types and boundary mappers for the MongoDB data layer.
 *
 * Replaces the Drizzle `sqliteTable` definitions that used to live here. There is
 * no ORM: `db/index.ts` owns the client and collection accessors, this module owns
 * the shapes and the conversions.
 *
 * The important contract: the domain layer speaks epoch SECONDS in `number`s,
 * exactly as it did when the timestamps were SQLite integers. Mongo stores BSON
 * `Date` (milliseconds). Every read must go through `toStudySession` and every
 * write through `fromStudySession`, or the units silently diverge — and nothing in
 * the type system will tell you, because both sides are `number` at the boundary.
 */

export type StudySessionStatus = "active" | "paused" | "completed";

/**
 * A study session as the rest of the app sees it. Unchanged from the Drizzle
 * `$inferSelect` version — four components type-import this name and pass
 * `startedAt`/`endedAt` into `lib/timer.ts`, which expects epoch seconds.
 */
export interface StudySession {
  id: string;
  userId?: string | null;
  subject: string;
  topic: string | null;
  /** Epoch SECONDS. */
  startedAt: number;
  /** Epoch SECONDS. */
  endedAt: number | null;
  durationSeconds: number;
  pausedSeconds: number;
  status: StudySessionStatus;
  /**
   * Epoch SECONDS of the current pause, or `null` when the session is not
   * paused.
   *
   * LEGACY. Nothing writes this any more: pausing is local state in
   * `lib/timer-store.ts` and never reaches the database, so a row is `active`
   * for its whole life and flips to `completed` once. A `paused` row is now
   * necessarily one written before that change, and this field is read only to
   * finish such a row exactly — `pauseAnchorSeconds` is the only sanctioned
   * reader, plus `lib/actions.ts#finishSession`.
   *
   * This used to be overloaded onto `updatedAt`, which broke the moment any
   * other code path touched a paused session — editing the notes of a paused
   * session moved the anchor forward and silently under-counted the pause.
   * `updatedAt` is now purely "row last modified"; nothing derives durations
   * from it.
   */
  pausedAt: number | null;
  outcome: string | null;
  goal: string | null;
  notes: string | null;
  /** Epoch SECONDS. */
  createdAt: number;
  /** Epoch SECONDS. "Row last modified". Never a duration input. */
  updatedAt: number;
}

/**
 * A study session being written. Optional fields mirror the SQL column defaults
 * that `fromStudySession` now applies (duration 0, paused 0, status "active").
 */
export interface NewStudySession {
  id: string;
  userId?: string | null;
  subject: string;
  topic?: string | null;
  goal?: string | null;
  outcome?: string | null;
  notes?: string | null;
  /** Epoch SECONDS. */
  startedAt: number;
  /** Epoch SECONDS. */
  endedAt?: number | null;
  durationSeconds?: number;
  pausedSeconds?: number;
  status?: StudySessionStatus;
  /** Epoch SECONDS. Defaults to `null`. */
  pausedAt?: number | null;
  /** Epoch SECONDS. Defaults to now. */
  createdAt?: number;
  /** Epoch SECONDS. Defaults to now. */
  updatedAt?: number;
}

/**
 * The on-disk document shape. Identical to `StudySession` except that `_id`
 * replaces `id` and every timestamp is a BSON `Date`.
 */
export interface StudySessionDoc {
  _id: string;
  userId?: string | null;
  subject: string;
  topic: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number;
  pausedSeconds: number;
  status: StudySessionStatus;
  pausedAt: Date | null;
  outcome: string | null;
  goal: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Better Auth's `user` collection. Owned by `@better-auth/mongo-adapter` — this
 * type exists so scripts can read it without casting, not so the app can write to
 * it. `_id` is a string because `lib/auth.ts` sets
 * `advanced.database.generateId`, which makes the adapter skip ObjectId coercion.
 */
export interface UserDoc {
  _id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  username: string;
  displayUsername?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** BSON `Date` → epoch seconds. */
export function toEpochSeconds(value: Date): number {
  return Math.floor(value.getTime() / 1000);
}

/** Epoch seconds → BSON `Date`. The `* 1000` is the whole ball game. */
export function fromEpochSeconds(value: number): Date {
  return new Date(value * 1000);
}

export function toStudySession(doc: StudySessionDoc): StudySession {
  return {
    id: doc._id,
    userId: doc.userId ?? null,
    subject: doc.subject,
    topic: doc.topic ?? null,
    startedAt: toEpochSeconds(doc.startedAt),
    endedAt: doc.endedAt ? toEpochSeconds(doc.endedAt) : null,
    durationSeconds: doc.durationSeconds,
    pausedSeconds: doc.pausedSeconds,
    status: doc.status,
    pausedAt: doc.pausedAt ? toEpochSeconds(doc.pausedAt) : null,
    outcome: doc.outcome ?? null,
    goal: doc.goal ?? null,
    notes: doc.notes ?? null,
    createdAt: toEpochSeconds(doc.createdAt),
    updatedAt: toEpochSeconds(doc.updatedAt),
  };
}

export function fromStudySession(session: NewStudySession): StudySessionDoc {
  const now = Math.floor(Date.now() / 1000);

  return {
    _id: session.id,
    userId: session.userId ?? null,
    subject: session.subject,
    topic: session.topic ?? null,
    startedAt: fromEpochSeconds(session.startedAt),
    endedAt:
      session.endedAt === undefined || session.endedAt === null
        ? null
        : fromEpochSeconds(session.endedAt),
    durationSeconds: session.durationSeconds ?? 0,
    pausedSeconds: session.pausedSeconds ?? 0,
    status: session.status ?? "active",
    pausedAt:
      session.pausedAt === undefined || session.pausedAt === null
        ? null
        : fromEpochSeconds(session.pausedAt),
    outcome: session.outcome ?? null,
    goal: session.goal ?? null,
    notes: session.notes ?? null,
    createdAt: fromEpochSeconds(session.createdAt ?? now),
    updatedAt: fromEpochSeconds(session.updatedAt ?? now),
  };
}

/**
 * Converts a partial update (epoch seconds) into a partial document (BSON
 * `Date`s). Explicit field-by-field rather than a spread so a timestamp can
 * never slip through unconverted.
 */
export function toUpdateDoc(
  data: Partial<NewStudySession>
): Partial<StudySessionDoc> {
  const update: Partial<StudySessionDoc> = {};

  if (data.startedAt !== undefined)
    update.startedAt = fromEpochSeconds(data.startedAt);
  if (data.endedAt !== undefined)
    update.endedAt =
      data.endedAt === null ? null : fromEpochSeconds(data.endedAt);
  if (data.createdAt !== undefined)
    update.createdAt = fromEpochSeconds(data.createdAt);
  if (data.updatedAt !== undefined)
    update.updatedAt = fromEpochSeconds(data.updatedAt);
  if (data.pausedAt !== undefined)
    update.pausedAt =
      data.pausedAt === null ? null : fromEpochSeconds(data.pausedAt);

  if (data.subject !== undefined) update.subject = data.subject;
  if (data.topic !== undefined) update.topic = data.topic;
  if (data.goal !== undefined) update.goal = data.goal;
  if (data.outcome !== undefined) update.outcome = data.outcome;
  if (data.notes !== undefined) update.notes = data.notes;
  if (data.durationSeconds !== undefined)
    update.durationSeconds = data.durationSeconds;
  if (data.pausedSeconds !== undefined)
    update.pausedSeconds = data.pausedSeconds;
  if (data.status !== undefined) update.status = data.status;
  if (data.userId !== undefined) update.userId = data.userId;

  return update;
}

/**
 * Epoch SECONDS at which the current pause began, or `null` if the session is
 * not paused.
 *
 * The single place allowed to answer "how long has this been paused", so the
 * server actions, the client timer, and any future reader cannot drift apart.
 * The `?? updatedAt` arm is a legacy shim for documents written before
 * `pausedAt` existed, where `updatedAt` WAS the anchor. It only applies while
 * `status` is "paused" — a completed row that merely got edited afterwards
 * must never be read as a pause start. `npm run db:backfill-paused-at` makes
 * the shim permanently unnecessary.
 */
export function pauseAnchorSeconds(
  session: Pick<StudySession, "status" | "pausedAt" | "updatedAt">
): number | null {
  if (session.status !== "paused") return null;
  return session.pausedAt ?? session.updatedAt;
}

/**
 * Escapes a user-supplied search term for safe use inside a `$regex`.
 *
 * `getSessions` searches with a leading-wildcard pattern, which no B-tree index
 * can serve, so the alternative to `$regex` is a Mongo text index — and `$text`
 * cannot be sorted by anything but relevance score, while `getSessions` always
 * orders by `startedAt`. So: `$regex`, escaped.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
