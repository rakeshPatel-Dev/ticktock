import type { Collection, Document, IndexDescriptionInfo } from "mongodb";
import { MongoServerError } from "mongodb";
import { db, studySessions, users } from "./index";

/**
 * Create the desired indexes, first dropping any index of the same name whose spec
 * has drifted.
 *
 * `createIndexes` alone is not enough: given an existing index name with a different
 * spec, MongoDB raises `IndexOptionsConflict` (85) and the whole bootstrap aborts.
 * That is not hypothetical — making these two unique indexes partial (see below)
 * changed their spec under indexes that already existed. Comparing before writing
 * keeps the bootstrap idempotent across spec changes instead of failing once and
 * then needing a manual `dropIndex`.
 */
async function reconcileIndexes<T extends Document>(
  collection: Collection<T>,
  specs: IndexDescriptionInfo[]
): Promise<void> {
  // `listIndexes` throws NamespaceNotFound on a collection that does not exist
  // yet, and a brand-new database has none — so the bootstrap would refuse to
  // run on exactly the database that needs it most. Treat "collection absent"
  // as "no indexes", which is what it means.
  const existing = await collection.indexes().catch((err: unknown) => {
    if (
      err instanceof MongoServerError &&
      (err.code === 26 || err.codeName === "NamespaceNotFound")
    ) {
      return [] as IndexDescriptionInfo[];
    }
    throw err;
  });
  const byName = new Map<string, IndexDescriptionInfo>();
  for (const i of existing) {
    // `_id_` and driver-internal indexes always carry a name; the type allows
    // undefined for hand-built descriptions, so narrow rather than assert.
    if (i.name) byName.set(i.name, i);
  }

  const stale: string[] = [];
  for (const spec of specs) {
    const name = spec.name;
    if (!name) continue;
    const current = byName.get(name);
    if (!current) continue;
    const same =
      JSON.stringify(current.key) === JSON.stringify(spec.key) &&
      Boolean(current.unique) === Boolean(spec.unique ?? false) &&
      JSON.stringify(current.partialFilterExpression ?? null) ===
        JSON.stringify(spec.partialFilterExpression ?? null);
    if (!same) stale.push(name);
  }

  for (const name of stale) {
    await collection.dropIndex(name);
  }

  await collection.createIndexes(specs);
}

/**
 * Idempotent index bootstrap for the collections this app owns.
 *
 * Safe to run on every boot and from the CLI script.
 */
export async function ensureIndexes(): Promise<void> {
  await reconcileIndexes(studySessions, [
    { key: { userId: 1, startedAt: -1 }, name: "user_started_idx" },
    { key: { userId: 1, status: 1 }, name: "user_status_idx" },
    { key: { userId: 1, subject: 1 }, name: "user_subject_idx" },
    // The active-session invariant, previously only enforced by a check-then-act
    // SELECT in `createSession`. A partial unique index makes the database hold
    // the line; `createSession` catches the resulting E11000 and returns the same
    // ACTIVE_SESSION_EXISTS error code as before.
    {
      key: { userId: 1, status: 1, startedAt: -1 },
      name: "active_session_uniq",
      unique: true,
      partialFilterExpression: { status: { $in: ["active", "paused"] } },
    },
  ]);

  // Better Auth checks email/username uniqueness in application code, but a
  // concurrent double signup can slip between its SELECT and INSERT. Verified
  // against a live cluster: the adapter's own `ensureModelIndexes` did NOT create
  // these (the `user` collection came up with `_id_` only), so the app owns them.
  //
  // `partialFilterExpression` is load-bearing, not defensive decoration. A plain
  // unique index treats a missing field as `null`, so a non-partial index would
  // permit exactly ONE user with no username — the second insert fails E11000. That
  // is unreachable through the signup form (the zod schema demands >= 3 chars) but
  // reachable by POSTing straight to `/api/auth/sign-up/email` with just email and
  // password. Scoping each index to `{$type: "string"}` makes absent fields simply
  // unindexed, so they never collide with each other.
  await reconcileIndexes(users, [
    {
      key: { email: 1 },
      name: "user_email_idx",
      unique: true,
      partialFilterExpression: { email: { $type: "string" } },
    },
    {
      key: { username: 1 },
      name: "user_username_idx",
      unique: true,
      partialFilterExpression: { username: { $type: "string" } },
    },
  ]);

  await reconcileIndexes(db.collection("session"), [
    {
      key: { token: 1 },
      name: "session_token_idx",
      unique: true,
      partialFilterExpression: { token: { $type: "string" } },
    },
  ]);
}
