# SQLite/libSQL → MongoDB Atlas Rewrite Plan (no data migration)

Status: **implemented** · Authored against commit `785b5e2` · Next.js 16.3.5 · better-auth 1.7.5
Supersedes the earlier data-migrating draft of this document. Section 12 records the delta.
Section 13 records what was actually built, the decisions made along the way, and the
verification results. Revert target: git tag `pre-mongo-rewrite`.

---

## 0. Read this first: the premise needs one correction

**You are not running SQLite on a cloud VM. You are on Turso (hosted libSQL over HTTPS).**
`db/index.ts:9-48` resolves `DATABASE_URL` → `TURSO_DATABASE_URL` and rejects local paths in
production. Prod points at `libsql://ticktock-*.aws-ap-south-1.turso.io`. Every Drizzle
`db.select()` is therefore an **HTTPS round trip** from a Vercel function to Mumbai.

That is the real latency source, and it is not SQLite's fault. A relational engine would be
equally slow over that link. MongoDB Atlas will help *only if* you pick a region near your
Vercel functions — otherwise you have swapped one cross-region round trip for another.

**What is actually slow.** Two distinct problems, only one of which MongoDB fixes:

| Problem | Location | Fixed by Atlas? |
|---|---|---|
| Per-query HTTPS RTT, Vercel region → `aws-ap-south-1` | every `db.select()` in `lib/queries.ts` | **Yes**, if you co-locate the cluster |
| Dashboard fires 3 sequential awaited queries | `lib/queries.ts:143-202` | Partly — `Promise.all` helps regardless of DB |
| 3 analytics/export queries fetch a user's **entire** history into JS | `lib/queries.ts:277`, `:317`, `app/api/export/route.ts:19` | **Yes** — these become `$group` pipelines that never leave the server |

**Treat items 2 and 3 as required work, not optional polish.** They are currently unbounded
memory reads and a latent outage at ~10k sessions per user regardless of which database you pick.

---

## 1. The decision: discard the data, keep the schema shape

### 1.1 What is actually in Turso

Measured live against the dev Turso database (not estimated):

| Table | Rows | Nature |
|---|---|---|
| `user` | 2 | `rakesh`, `testuser` — both `@ticktock.local` |
| `account` | 2 | credential rows for those two |
| `session` | 10 | auth sessions, regenerate on next login |
| `verification` | 0 | — |
| `sessions` | 5 | study sessions, **all `rakesh`, all completed** |
| **Total** | **19** | |

The 5 study sessions are **not** seed data. `scripts/seed.ts:43-118` seeds
DSA / DBMS / Operating Systems / Computer Networks; the live rows are:

| Date (UTC) | Subject | Duration |
|---|---|---|
| 2026-09-21 | Complete Java | 3h 24m |
| 2026-09-22 | Complete Java | 2h 55m |
| 2026-09-23 | OB & HRM | 1h 31m |
| 2026-09-24 | Discrete Structure | 3h 51m |
| 2026-09-27 | Digital Logic | 3h 06m |
| | **Total** | **14h 48m** |

`testuser` has zero study sessions. No source file references either username — they were
created through `/signup` by hand, not by any script.

### 1.2 Why discarding is the right call

- **No real users.** Both accounts are `@ticktock.local`. There is no genuine account to lose.
- **19 rows.** A migration script for 19 rows is more code than the copy it performs.
- **The loss is bounded and known:** 2 throwaway accounts and 5 completed sessions totalling
  under 15 hours. Recreating the accounts takes 60 seconds at `/signup`; recreating the
  sessions by hand takes about two minutes.
- **It removes the three highest-likelihood failure modes from the project** (see §10). Those
  were all *migration* bugs, and this decision eliminates all three by construction.

### 1.3 Before deleting Turso access, keep a human-readable record

Cheap insurance, and the app can produce it for you: while still logged in as `rakesh`, hit
`GET /api/export?format=json` and save the response to `docs/pre-mongo-sessions.json`
(git-ignore it if you prefer). It is the complete pre-migration state in a form you can read
and hand-enter from. Do this **before** Phase A — after cutover it is gone.

This is a 30-second step and it is the only thing standing between "discard the data" and
"permanently forgot what the data was".

---

## 2. Hard constraints discovered (these dictate the design)

### 2.1 Drizzle has no MongoDB dialect — Drizzle must be deleted entirely

Verified against the installed `drizzle-orm@0.45.2`:

```
ls node_modules/drizzle-orm/ | grep -i mongo   →   NONE
```

Zero Mongo support. There is no ORM-preserving path. Consequences:

- `db/schema.ts` (Drizzle `sqliteTable` definitions, `:7-125`) is deleted, replaced with
  hand-written TypeScript types + a collection accessor.
- `drizzle.config.ts` and the `drizzle/` directory are deleted.
- Every `db.select() / insert() / update() / delete()` call is rewritten by hand against the
  native `mongodb` driver.
- `drizzle-orm`, `drizzle-kit`, `@libsql/client`, `better-sqlite3`, `@types/better-sqlite3`,
  `@better-auth/drizzle-adapter` all leave `package.json`.

**This is the entire project.** It is unrelated to your data, and discarding the data does not
reduce it by one line. Ten files are Drizzle-coupled, ~1,266 lines:

| File | Lines | Drizzle coupling |
|---|---|---|
| `lib/queries.ts` | 345 | 8 exported fns, operators imported at `:3` |
| `lib/actions.ts` | 337 | 7 server actions, operators imported at `:5` |
| `scripts/verify-e2e.ts` | 156 | 6 `db.*` calls — **your only test harness** |
| `scripts/seed.ts` | 145 | 3 `db.*` calls |
| `db/schema.ts` | 128 | the schema itself |
| `db/index.ts` | 61 | client construction |
| `app/api/export/route.ts` | 94 | 1 unbounded select at `:19` |
| `lib/auth.ts` | 41 | `drizzleAdapter` at `:3`, `:12-13` |
| `drizzle.config.ts` | 15 | deleted |

### 2.2 `mongodb` is a hard dependency of the adapter, and it is not installed

`@better-auth/mongo-adapter@1.7.5` is present (transitive via `better-auth`) but line 3 of its
bundle is:

```js
import { ObjectId, UUID } from "mongodb";
```

Module-scope import. `npm ls mongodb` currently resolves nothing. **The adapter will not even
load** until you `npm i mongodb`. This is step 1 of Phase A, not an afterthought.

### 2.3 ID-type coercion — downgraded from critical to cosmetic

`@better-auth/mongo-adapter/dist/index.mjs:511-536` coerces every ID-shaped field:

```js
customTransformInput({ action, data, field, fieldAttributes, ... }) {
  const customIdGen = getCustomIdGenerator(options);
  if (field === "_id" || fieldAttributes.references?.field === "id") {
    if (customIdGen) return data;          // ← escape hatch
    if (action !== "create" && action !== "update") return data;
    const IdClass = options.advanced?.database?.generateId === "uuid" ? UUID : ObjectId;
    if (typeof data === "string") try { return new IdClass(data); } catch { return data; }
    ...
    return new IdClass();
  }
```

`getCustomIdGenerator` (`:90-93`) returns `options.advanced?.database?.generateId` **only if it
is a function**.

**Without a data migration this is no longer a correctness hazard.** The original plan's
failure mode — migrated rows as string `_id` beside new rows as `ObjectId`, in one collection,
with `findOne({_id})` silently missing half of them — requires pre-existing rows. There are
none. Every document in every auth collection will be written by the same adapter, so types
are uniform by construction.

**Still set the override, for consistency rather than safety:**

```ts
// lib/auth.ts
advanced: {
  database: {
    // A *function* makes the adapter skip all ObjectId/UUID coercion (index.mjs:514).
    generateId: () => crypto.randomUUID(),
  },
},
```

Reasons: `crypto.randomUUID()` is already this codebase's ID convention
(`lib/actions.ts:77`), so auth IDs and study-session IDs look alike in a shell; and it means
`user._id` is greppable rather than an `ObjectId(...)` blob. Type confirmed at
`@better-auth/core/dist/types/init-options.d.mts:374`:
`generateId?: GenerateIdFn | false | "serial" | "uuid"`.

**Consequence to understand, whichever way you go:** if you *omit* the override, `user._id`
becomes an `ObjectId` while `studySessions.userId` stays a hex string written by your own code
(`customTransformOutput` at `:537-541` converts `ObjectId` → `toHexString()` on read). That is
internally consistent and will work — your `studySessions` queries filter on the hex string
from `session.user.id` throughout — but it means two ID conventions in one database. The
override removes the question.

### 2.4 Passing `client` to the adapter enables transactions → requires a replica set

`@better-auth/mongo-adapter/dist/index.mjs:492-494`:

```js
const session = config.client.startSession();
session.startTransaction();
```

If you hand the adapter a `MongoClient`, Better Auth wraps operations in real Mongo
transactions. Transactions **require a replica set**. Atlas is one, so production is fine. A
bare local `mongod` is not, so `npm run dev` against `localhost:27017` will fail.

**Decision: do not pass `client`.** The app has **zero** transactions (`db.transaction` appears
in 0 files), so there is nothing to lose. If you later add multi-document writes that need
atomicity, pass `client` in production only.

> Alternative: run local Mongo as a single-node replica set
> (`mongod --replSet rs0` + one `rs.initiate()`). Only if you want prod/dev parity on
> transactions. `docker compose` with `--replSet` is the usual route.

### 2.5 Collection-name collision: `session` vs `sessions`

`index.mjs:484` — `usePlural: config?.usePlural ?? false`. Better Auth defaults to **singular**
collections: `user`, `session`, `account`, `verification`.

Your domain table is called **`sessions`** (plural). You would have `session` (auth) and
`sessions` (study) in one database, differing by one letter, in scripts and debugging.

**Decision: rename the domain collection to `studySessions`.** No code depends on the SQL
table name; only the Drizzle symbol `sessions` (`db/schema.ts:97`) is used, and that is being
rewritten anyway.

### 2.6 Two different timestamp units are in play today

| Table | Drizzle type | Unit |
|---|---|---|
| `user`, `session`, `account`, `verification` | `integer({ mode: "timestamp_ms" })` | **milliseconds** |
| `sessions` (domain) | bare `integer()` (`db/schema.ts:106,116`) | **seconds** |

The domain table has no `mode`, so `startedAt`, `endedAt`, `createdAt`, `updatedAt` are all
Unix **seconds**, and the arithmetic depends on it:

- `lib/actions.ts:170-182` — `pauseDelta = Math.max(0, now - session.updatedAt)`
- `lib/actions.ts:222-223` — same trick in `finishSession`
- `lib/timer.ts:11-19` — `calculateDuration(startedAt, endedAt, pausedSeconds)`, all seconds
- `lib/timer.ts:56-57, 64-65` — `new Date(timestamp * 1000)`

MongoDB's native date type is BSON `Date`, which is **milliseconds**. Storing seconds-as-number
would force every range query and every day-bucket into `$expr` arithmetic.

**Decision: store BSON `Date` in Mongo; keep the domain layer on epoch seconds via an explicit
boundary mapper.** The DB layer speaks `Date`; `StudySession` keeps `startedAt: number` so
`lib/timer.ts` and the four client components need **zero changes**.

⚠️ **`sessions.updatedAt` is overloaded.** It is simultaneously "row last modified" *and* "the
timestamp this session was paused at" — the pause/resume delta is computed from it
(`lib/actions.ts:172`, `:223`). Preserve that semantic exactly, or paused-time accounting
silently breaks. See the Phase B checklist.

Note the asymmetry this creates with a fresh database: auth timestamps are written by the
adapter as `Date` (ms, matching Better Auth's expectation), domain timestamps are written by
your code and must be explicitly `new Date(sec * 1000)`. Two write paths, two conventions,
one mapper. That is the whole of §2.6.

### 2.7 The active-session invariant is currently unenforced

`lib/actions.ts:57-79` is check-then-act: `SELECT` for an active/paused row, then `INSERT`.
Two concurrent requests both pass the `SELECT` and both insert. There is no unique index behind
it, and `scripts/verify-e2e.ts:63-74` actively seeds two active sessions to assert the
invariant — which passes only because `getActiveSession` orders by `startedAt desc` and takes
`limit(1)`, not because anything prevents the second insert.

MongoDB can actually enforce this, which is a genuine improvement over the status quo:

```js
db.studySessions.createIndex(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["active", "paused"] } } }
)
```

Then `createSession` catches `E11000` and returns the existing `ACTIVE_SESSION_EXISTS` code.

⚠️ **This breaks `scripts/verify-e2e.ts:63-74` as written.** That test inserts two active
sessions on purpose. Rewrite it to assert that the *second insert throws* `E11000` — which is
a strictly better test than the one it replaces.

### 2.8 A "no local disk in production" guard must be ported

`db/index.ts:15-41` exists because `next build` evaluates `db/index.ts` with
`NODE_ENV=production` and must fail loudly rather than open an ephemeral file. Reproduce that
intent in the Mongo client: throw if `MONGODB_URI` is missing or non-remote outside development.
`.env.local` already documents a real incident where a stray `DATABASE_URL` broke the build.

### 2.9 SQLite has no cascades here, and neither does Mongo — same as today

`ON DELETE CASCADE` is declared on three FKs (`db/schema.ts:43, 56, 102`) but
`PRAGMA foreign_keys` is `0` on the local file and libSQL does not enable it, so it has never
actually fired. Mongo has no cascades. **No regression** — but if you ever add user deletion,
you must write explicit `deleteMany` calls for `studySessions`, `session` and `account`.

---

## 3. Target architecture

```
Next.js 16 (Vercel, serverless)
├── db/index.ts        MongoClient singleton, cached on globalThis in dev
│                       (mirrors the existing HMR-safe pattern at db/index.ts:50-59)
├── db/schema.ts       hand-written types + collection accessors (no ORM)
├── db/indexes.ts      idempotent createIndex() bootstrap
├── lib/queries.ts     8 read fns, native driver + $group pipelines
├── lib/actions.ts     7 mutations, native driver
└── lib/auth.ts        mongodbAdapter(db, { usePlural: false })
                         + advanced.database.generateId = () => crypto.randomUUID()

MongoDB Atlas
├── user          (auth,    singular, camelCase, _id: string)
├── session       (auth,    singular, camelCase, _id: string)
├── account       (auth,    singular, camelCase, _id: string)
├── verification  (auth,    singular, camelCase, _id: string)
└── studySessions (domain,  renamed from `sessions`)
```

Collections `user`/`session`/`account`/`verification` are owned by the Better Auth adapter —
**do not hand-write writes against them.** The adapter creates its own indexes
(`ensureModelIndexes`). `studySessions` is entirely yours.

---

## 4. Schema mapping

`_id` is a **string** in all five collections (see §2.3). Auth field names are camelCase by
Better Auth's default (`@better-auth/core/dist/db/get-tables.mjs` — `fieldName` defaults to
the camelCase key, and this app sets no overrides). Nothing here is copied from SQLite; this is
the target shape your new code writes.

### 4.1 `user` → `user`

| Field | Type | Note |
|---|---|---|
| `_id` | string | `crypto.randomUUID()` |
| `name` | string | |
| `email` | string | unique |
| `emailVerified` | **boolean** | SQLite used `integer({mode:"boolean"})` |
| `image` | string? | |
| `username` | string | unique |
| `displayUsername` | string? | |
| `createdAt` | **Date** | |
| `updatedAt` | **Date** | |

### 4.2 `session` → `session`

`_id` string · `expiresAt` **Date** · `token` string (unique) · `createdAt` **Date** ·
`updatedAt` **Date** · `ipAddress` string? · `userAgent` string? · `userId` string

### 4.3 `account` → `account`

`_id` string · `accountId` string · `providerId` string · `userId` string ·
`accessToken`/`refreshToken`/`idToken` string? · `accessTokenExpiresAt` **Date?** ·
`refreshTokenExpiresAt` **Date?** · `scope` string? · `password` string? (credential hash —
**scrypt**, not bcrypt; Better Auth 1.7.5 defaults to `node:crypto` scrypt. Written and read
only by the adapter) · `createdAt` **Date** · `updatedAt` **Date**

### 4.4 `verification` → `verification`

`_id` string · `identifier` string · `value` string · `expiresAt` **Date** · `createdAt` **Date**
· `updatedAt` **Date**

### 4.5 `sessions` → `studySessions`

| Field | Type | Note |
|---|---|---|
| `_id` | string | `crypto.randomUUID()`, mirrors `lib/actions.ts:77` |
| `userId` | string? | **keep optional** — was nullable at `db/schema.ts:100-103` |
| `subject` | string | |
| `topic` | string? | |
| `startedAt` | **Date** | boundary mapper converts epoch seconds ↔ Date |
| `endedAt` | **Date?** | |
| `durationSeconds` | int32 | |
| `pausedSeconds` | int32 | |
| `status` | `"active" \| "paused" \| "completed"` | unenforced on both sides |
| `outcome` / `goal` / `notes` | string? | |
| `createdAt` | **Date** | |
| `updatedAt` | **Date** | **overloaded**, see §2.6 |

### 4.6 `StudySession` type — keep it byte-identical to today

Four components type-import `StudySession` (`components/timer.tsx:6`,
`dashboard-summary.tsx:7`, `session-list.tsx:5`, `session-detail-modal.tsx:5`) and all of them
pass `session.startedAt` into `lib/timer.ts` helpers that expect **epoch seconds**.

Define it by hand so the rewrite is invisible to the UI:

```ts
export interface StudySession {
  id: string;
  userId?: string | null;
  subject: string;
  topic: string | null;
  startedAt: number;        // epoch SECONDS — unchanged contract
  endedAt: number | null;
  durationSeconds: number;
  pausedSeconds: number;
  status: "active" | "paused" | "completed";
  outcome: string | null;
  goal: string | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}
```

Plus a private pair of mappers in `db/` (`toStudySession(doc)` / `fromStudySession(obj)`) that
absorb the `Date` ↔ epoch-seconds conversion. **Every read path must go through the mapper** —
this is the single easiest place to reintroduce a units bug, because nothing in the type system
distinguishes `number` seconds from `number` milliseconds.

Also define `NewStudySession` (`db/schema.ts:128` is deleted) for the insert paths, and keep the
name exported so the four components re-point without edits.

---

## 5. Index plan

Auth indexes are created automatically by the adapter (`ensureModelIndexes`). Do not hand-manage
those. You own `studySessions`.

```js
// db/indexes.ts — idempotent, run at startup in dev / via script in prod
db.studySessions.createIndexes([
  { key: { userId: 1, startedAt: -1 }, name: "user_started_idx" },
  { key: { userId: 1, status: 1 },   name: "user_status_idx"  },
  { key: { userId: 1, subject: 1 },  name: "user_subject_idx" },
  { key: { userId: 1, status: 1, startedAt: -1 },
    name: "active_session_uniq",
    unique: true,
    partialFilterExpression: { status: { $in: ["active", "paused"] } } },  // §2.7
])                                                 // no text index — see §5.1
```

⚠️ **The three auth indexes below are the app's job, not the adapter's.** The original plan
assumed `@better-auth/mongo-adapter`'s `ensureModelIndexes` would create them. Verified against
a live cluster: it does not — a freshly populated `user` collection came up with `_id_` only.
Better Auth checks email/username uniqueness in application code, so a concurrent double signup
can slip between its SELECT and INSERT. `db/indexes.ts` therefore creates them explicitly:

```js
db.user.createIndex({ email: 1 },    { unique: true })
db.user.createIndex({ username: 1 }, { unique: true })
db.session.createIndex({ token: 1 }, { unique: true })
```

**Why compound, not the four single-column SQLite indexes.** SQLite has one index per column and
relies on the planner. Every real query filters `userId` *and* something else
(`lib/queries.ts:46, 65, 84, 133, 162, 189, 234, 281, 321`). `{userId, startedAt}` and
`{userId, status}` serve them directly. The four original single-column indexes
(`db/schema.ts:120-123`) collapse into these.

**Nothing to load before indexing.** In a migration you would create indexes *after* the bulk
load. On an empty collection it does not matter — create them as soon as the client connects.

### 5.1 The `LIKE '%…%'` search is a full scan today

`lib/queries.ts:100-111` builds `%term%` across `subject`, `topic`, `notes`, `goal`. No B-tree
index can serve a leading-wildcard pattern — this scans every row for the user. A Mongo text
index fixes it. Two caveats:

- SQLite `LIKE` is **ASCII case-insensitive by default**; a Mongo `$text` search is
  case-insensitive only for the indexed language's terms. `default_language: "none"` disables
  stemming/stopwords so `DBMS` and `dbms` match the way they do today.
- `$text` also does word-prefix matching that `LIKE` does not, and cannot be combined with
  `$regex` in one query. If exact substring parity matters more than speed, keep `$regex` with
  the `i` flag plus regex escaping and accept the scan.

  **RESOLVED during implementation: `$regex`, not `$text`.** A `$text` query cannot be sorted by
  anything except its relevance score, and `getSessions` *always* orders by `startedAt`
  descending. The two are incompatible, so the text index was dropped from the index plan
  entirely and `escapeRegex` + `$regex` with the `i` flag is used instead. That also preserves
  SQLite `LIKE`'s exact substring semantics, which `$text` tokenisation would have changed.

### 5.2 Move analytics to aggregation pipelines

Three queries currently pull a user's entire completed history into JS and aggregate there:

| Function | Current | Target |
|---|---|---|
| `getSubjectAnalytics` (`queries.ts:274-309`) | full scan → JS `Map` | `$group` by `subject`, `$sum: "$durationSeconds"` |
| `getTopicAnalytics` (`queries.ts:314-345`) | full scan → JS `Map` on `` `${subject}:::${topic}` `` | `$group` on the same composite key |
| `getDailyAnalytics` (`queries.ts:207-269`) | range scan → JS day-`Map` | `$group` by `$dateTrunc`/`$dateToString` on `startedAt` |

The server returns aggregates instead of documents, so result size stops growing with history
length. This is the change that most directly addresses "too slow".

`getAllSubjects` (`queries.ts:129-138`) is a fourth full-history read and a fifth candidate for
`distinct()`.

⚠️ **Preserve the existing day-bucketing semantics, bug included.** `queries.ts:239-262` buckets
on **UTC** (`toISOString().split("T")[0]`) but computes day boundaries in **local** time
(`setHours(0,0,0,0)` at `:217`, `:221`). In IST that misassigns sessions between 00:00 and 05:30.
Port the current behaviour verbatim, then fix it as a separate, tested change. Mixing the two into
one rewrite makes a data-correctness bug indistinguishable from a migration bug.

Also preserve `getAllSubjects`' exact semantics: it dedupes on `s.subject.trim()` but filters with
`Boolean` on the *trimmed* value while storing the **untrimmed** subject (`:136-137`).

### 5.3 Parallelize the dashboard

`getDashboardSummary` (`queries.ts:143-202`) awaits three independent queries in sequence
(`todaySessions` → `getActiveSession` → `recentSessions`). With the native driver these are three
concurrent round trips — `Promise.all` cuts dashboard latency to roughly the slowest single query.

---

## 6. Code change inventory

### Rewrite (Drizzle-coupled)

| File | Change |
|---|---|
| `db/index.ts` | `MongoClient` singleton; drop `getDbUrl()` libSQL parsing + `file:` handling; port the production guard (§2.8); keep the `globalThis` HMR pattern from `:50-59` |
| `db/schema.ts` | Delete Drizzle tables. Hand-written `StudySession` + auth collection types + `toStudySession`/`fromStudySession` mappers (§4.6) |
| `db/indexes.ts` | **New.** Idempotent `createIndexes` (§5) |
| `lib/auth.ts` | `:3` drop `drizzleAdapter`; `:12-13` → `mongodbAdapter(db, { usePlural: false })`; add `advanced.database.generateId` (§2.3) |
| `lib/queries.ts` | All 8 fns. Operators at `:3` (`eq,and,gte,lte,inArray,like,or,desc`) → native filters. §5.2 pipelines for the 3 analytics fns. §5.1 search decision. §5.3 `Promise.all` |
| `lib/actions.ts` | All 7 mutations. Operators at `:5`. `insert` at `:79` → `insertOne`. `update` at `:131,175,228,279` → `updateOne`. `delete` at `:305,327` → `deleteOne`/`deleteMany`. `sessions.$inferInsert` at `:268` → `NewStudySession`. `E11000` catch at `:69` (§2.7) |
| `app/api/export/route.ts` | `:3-5` imports; `:19` unbounded select → cursor / `.toArray()` with the same field list |
| `scripts/seed.ts` | `:3-5` imports; `:21` lookup; `:35` `deleteMany`; `:133` bulk insert → `insertMany`. **Stays** — it is now the way you get demo data back (§7) |
| `scripts/verify-e2e.ts` | `:3-5` imports + all `db.*` calls at `:30,39,49,64,86,95,104,108,131,140,146`. **Must be rewritten before it can verify anything.** Also fix the concurrency test per §2.7 |

### Delete

`drizzle.config.ts` · `drizzle/` (incl. `meta/`) · `sqlite.db` (86 KB, untracked) ·
`db:generate` + `db:push` npm scripts

### No change required

- `lib/timer.ts` — keeps the epoch-seconds contract (§4.6)
- All 4 components' `import { type StudySession }` — re-points automatically once `db/schema.ts`
  still exports the name
- `app/api/auth/[...all]/route.ts`, `lib/session.ts`, `lib/auth-actions.ts`, `lib/auth-client.ts`,
  `lib/colors.ts`, `lib/shortcuts.ts`, `lib/utils.ts`, `proxy.ts`, all pages/layouts,
  all `components/ui/*`
- `vercel.json` — env var names change, config does not

### `package.json`

```diff
   dependencies:
+   "mongodb": "^7.6.0"
-   "drizzle-orm", "drizzle-kit"(dev), "@libsql/client", "better-sqlite3",
-   "@types/better-sqlite3"(dev), "@better-auth/drizzle-adapter"
   scripts:
-   "db:generate", "db:push"
+   "db:indexes": "tsx scripts/create-indexes.ts"
```

`@better-auth/mongo-adapter@1.7.5` is already installed (transitive) and re-exported as
`better-auth/adapters/mongodb`. Installing `mongodb` is **mandatory** (§2.2) — the adapter
imports `ObjectId` and `UUID` at module scope and will not load without it.

Also promote `tsx` (4.23.13) and `dotenv` (17.4.2) to real dev dependencies: both currently
resolve only transitively through `drizzle-kit`, and dropping Drizzle breaks `npm run seed`
and `npm run test:e2e` unless you do this.

### Env

```diff
- TURSO_DATABASE_URL=libsql://...
- TURSO_AUTH_TOKEN=...
+ MONGODB_URI=mongodb+srv://...   # already present at .env.local
```

`MONGODB_URI`, `MONGODB_USERNAME` and `MONGODB_PASSWORD` are **already in `.env.local`** — a
cluster appears to be provisioned. Confirm its region before writing code (§7, Phase 0).

Unlike the migrating plan, there is no reason to keep `TURSO_*` around during the rewrite: there
is no data to fall back to, so the "rollback" they enable is not a real option. Remove them when
you remove the code.

### Docs to update

`README.md` · `HANDOFF.md:18-19,71-100` · `docs/DB_SCHEMA.md` (rewrite — it documents SQLite
DDL) · `docs/FOLDER_STRUCTURE.md` · `docs/API.md` · `PHASES.md`

---

## 7. Execution phases

Three phases, not five. No dual-database window, no migration script, no data verification
harness — because there is no data. Each phase ends at a gate; do not proceed on a failed gate.

### Phase A — Infrastructure and auth (no cutover)

1. **Export the record** (§1.3). `GET /api/export?format=json` as `rakesh`, save it. Do this
   before anything else.
2. `npm i mongodb@^7.6.0`; promote `tsx` + `dotenv` to devDependencies.
3. Confirm the Atlas cluster region against your Vercel function region, and pick an **M0 (free)**
   cluster if you have not already — at this scale free is sufficient.
4. **Measure a baseline now**, before any change: dashboard p50/p95, `/analytics` p95, and the
   Turso round-trip time per query. Without a baseline you cannot prove the rewrite fixed
   anything, and you will not know whether remaining slowness is the DB or the region.
5. Write `db/schema.ts` (types + mappers) and `db/indexes.ts`.
6. Write the new `db/index.ts` with the production guard (§2.8).
7. Wire `lib/auth.ts` to `mongodbAdapter` with the `generateId` override (§2.3).
8. Leave `lib/queries.ts` / `lib/actions.ts` on Drizzle for now — do not try to land both
   clients in one commit.

**Gate:** `npm run build` clean; `tsc --noEmit` clean; `createIndexes` runs clean twice (proving
idempotency); sign up on **Turso** through the new auth path and confirm it still works end to end.

### Phase B — Query layer rewrite (the actual work)

1. Migrate `lib/queries.ts` in dependency order: `getSessionById` → `getActiveSession` →
   `getSessions` → the three analytics fns → `getAllSubjects` → `getDashboardSummary`.
2. Then `lib/actions.ts` in lifecycle order: `createSession` (add the `E11000` catch from §2.7)
   → `pauseSession` → `resumeSession` → `finishSession` → `updateSession` → `deleteSession` →
   `clearAllSessions`.
3. Then `app/api/export/route.ts`.
4. Rewrite `scripts/seed.ts` and `scripts/verify-e2e.ts` **now** — they are your only harness and
   they are worthless while Drizzle-coupled.

**Phase B checklist — the silent-failure candidates:**

- [ ] `updatedAt` still means "paused at" for a paused session (§2.6). Pause/resume accumulates
      `now - session.updatedAt` in **seconds**. With BSON `Date` this must become
      `Math.floor(session.updatedAt.getTime() / 1000)`. Miss this and paused time silently becomes
      `NaN` or a multi-year value.
- [ ] **Every** read path goes through `toStudySession` (§4.6). `calculateDuration`
      (`lib/timer.ts:11`) must receive **seconds**, not `Date` and not milliseconds.
- [ ] All **writes** build `Date` from seconds with an explicit `* 1000`. There is no historical
      data to catch this for you — a missing `* 1000` writes dates in 1970 and nothing complains
      until the analytics page is empty.
- [ ] Search parity: decide `$text` vs `$regex`/`i` (§5.1) and make case-insensitivity match
      today's SQLite `LIKE`.
- [ ] `getDailyAnalytics` day bucketing still UTC while boundaries stay local (§5.2). Port the
      bug; do not fix it here.
- [ ] `getSubjectAnalytics` percentage uses `Math.round(dur/total*100)` — preserve the rounding.

**Gate:** every one of the 8 query fns and 7 actions returns a value byte-identical to the Drizzle
version for the same fixture. Diff them programmatically — a `deepEqual` harness over a fixed
fixture, old vs new, is worth the hour and is the closest thing to a migration test you get here.

### Phase C — Cutover

1. Merge A+B. Deploy to a Vercel **preview** first; run `test:e2e` against the preview's Mongo.
2. Create a fresh account at `/signup` on the preview. Run `npm run seed -- --user <name>`.
3. Set `MONGODB_URI` on the **production** Vercel project. Remove `TURSO_DATABASE_URL` /
   `TURSO_AUTH_TOKEN` in the same deploy — there is no fallback data, and leaving them invites a
   silent partial revert.
4. Deploy to production. Smoke test: signup → login → dashboard → create a session → pause →
   resume → finish → analytics → sessions list + search → export CSV → logout → login again.
5. Watch Atlas metrics and Vercel logs for 24h. Specifically: connection count vs pool ceiling,
   and any `E11000` from the new partial unique index (§2.7) — that one firing in production
   means the invariant was already being violated by the old check-then-act race, which is
   informative rather than alarming.
6. Delete `drizzle/`, `drizzle.config.ts`, `sqlite.db`, `.env.local.bak-*`. Update the docs in §6.

**Gate:** all smoke tests pass; no elevated error rate at 24h.

---

## 8. Rollback

This is the one real cost of discarding the data.

**The migrating plan's rollback was a config change** — unset `MONGODB_URI`, redeploy, and the
Turso copy was still whole. **That option does not exist here.** Once Drizzle is deleted, going
back means reverting the rewrite:

```
git revert <phase-A+B merge>          # or redeploy the previous Vercel deployment
```

**What that costs you:** anything created on Mongo after cutover. Since the app starts empty and
you have 5 sessions' worth of history at most, that is nothing.

**Practically:** keep the pre-migration commit reachable for at least 30 days, and prefer
Vercel's "promote previous deployment" over a git revert — it is one click and does not risk a
merge conflict in a 10-file rewrite. The first deploy after cutover is the risky one; the second
day is when you can delete the old commit.

**When to roll back immediately:**

- Signup or login fails (indicates a §2.3 ID-coercion or adapter-wiring mistake)
- Paused-time accounting is wrong (indicates §2.6 `updatedAt` mishandling)
- Dashboard shows sessions that exist but analytics shows none (indicates a `Date`/seconds
  mismatch in one of the three analytics pipelines)

All three should be caught by the Phase B gate, which is the argument for not skipping it.

---

## 9. Risk register

Revised for the no-migration variant. The three highest-likelihood items from the previous
register are gone.

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Underestimating the rewrite (Drizzle has no Mongo → everything hand-written) | **High** | Schedule | §2.1; budget Phase B as ~70% of the work |
| 2 | `updatedAt` seconds↔`Date` mishandled → broken pause accounting | **Medium** | High | §2.6 + Phase B checklist + `deepEqual` harness |
| 3 | Missing `* 1000` on a write → dates land in 1970, analytics silently empty | **Medium** | High | Phase B checklist; smoke-test analytics immediately after the first session |
| 4 | Atlas region ≠ Vercel region → still slow, project judged a failure | **Medium** | High | Phase A step 3; baseline in Phase A step 4 |
| 5 | `session` / `sessions` collection confusion | Medium | High | §2.5 rename to `studySessions` |
| 6 | `verify-e2e.ts` left Drizzle-coupled → no test coverage at cutover | Medium | High | Phase B step 4; it is rewritten before the gate |
| 7 | Search parity regression (case sensitivity, tokenisation) | Medium | Medium | §5.1 explicit decision in Phase B |
| 8 | Passing `client` locally → transactions fail on standalone `mongod` | Medium | Low | §2.4 omit `client` |
| 9 | Analytics `$group` changes numeric output (rounding) | Low | Medium | Preserve `Math.round(dur/total*100)`; covered by the `deepEqual` harness |
| 10 | Build breaks because `db/index.ts` evaluates at build time with `NODE_ENV=production` | Medium | Medium | §2.8 guard — this already broke a build once |
| 11 | Partial unique index (§2.7) breaks the existing concurrency test | **Certain** | Low | Expected; rewrite the test to assert `E11000` |
| 12 | Orphaned `studySessions` with `userId: null` | Low | Low | Keep `userId` optional; no validation |
| 13 | Rollback is a code revert, not a config flip | **Certain** | Low | §8; keep the old commit + Vercel deployment for 30 days |

**Removed from the previous register, and why:**

| Was | Now |
|---|---|
| `_id` mixed `ObjectId`/string → silent lookup misses (**High**) | Impossible — no pre-existing rows (§2.3) |
| Password hashes corrupted → total lockout (Low/Critical) | Impossible — no hashes to copy; nobody to lock out |
| `started_at` seconds written as ms in the migration script (Medium/High) | Replaced by risk #3, a code-path risk rather than a script risk |

---

## 10. Effort estimate

| Phase | Work | Relative |
|---|---|---|
| A | Export record, deps, Atlas region check, baseline, client, types, indexes, auth wiring | small |
| B | **Query + action rewrite, 15 fns, 2 scripts, index decisions** | **large — ~70% of the effort** |
| C | Cutover, smoke tests, cleanup, docs | small |

The data was 19 rows. The rewrite is ~60 call sites across 10 files. Discarding the data removes
a script and a verification harness; it does not move the needle on the part that is actually
hard. Keep the effort where the risk is.

---

## 11. Open decisions for you

1. **Atlas region** — what region are your Vercel functions in, and what region is the existing
   `MONGODB_URI` cluster? This determines whether the rewrite fixes latency or just changes
   vendors. **Answer this before writing any code.**
2. **Local dev** — bare `mongod` (no auth transactions, per §2.4), single-node replica set for
   parity, or Atlas-only with no local database at all?
3. **Search** — `$text` index (fast, slight semantic change) or `$regex` with `i` (exact parity,
   stays a scan)? (§5.1)
4. **Analytics** — port the UTC/local day-bucketing bug verbatim, or fix it as part of this work?
   Recommendation: port verbatim, fix separately with a test.
5. **Transactions** — adopt them for `createSession` and friends, or keep the current non-atomic
   read-modify-write? The partial unique index (§2.7) closes the one race that matters without
   full transactions.
6. **The 5 lost sessions** — recreate by hand from `docs/pre-mongo-sessions.json`, or accept the
   empty history? (`npm run seed` covers demo data but not your real subjects.)

---

## 12. Delta from the previous draft of this document

For anyone who read the earlier data-migrating version: the rewrite content (§2, §3, §4, §5, §6)
is unchanged in substance. What changed:

- **§5 (migration script) deleted entirely** — `migrate-to-mongo.ts`, the transform rules, the
  orphan guard, the load ordering, and all eight verification checks. There is nothing to move.
- **§8 rollback demoted** from a config flip to a code revert, with the reasoning in §1.2.
- **Risk register pruned** — three entries removed (§9), one added for the missing `* 1000` on
  writes, which is now a code risk rather than a script risk.
- **§2.3 ID coercion downgraded** from the single highest-risk item to a consistency
  recommendation, with the reasoning stated explicitly.
- **§1.3 added** — export the pre-migration record before cutting over.
- **Phases collapsed 5 → 3**, removing the dual-database coexistence window.
- **§1.1/§1.2 added** — the measured contents of Turso and the argument for discarding them.

---

## 13. Implementation record

Status: **done.** Revert target is the git tag `pre-mongo-rewrite` (at `785b5e2`).

### 13.1 What was actually built

| File | Change |
|---|---|
| `db/index.ts` | `MongoClient` singleton on `globalThis`, `Db` handle, `studySessions` + `users` collection accessors, production guard with credential redaction |
| `db/schema.ts` | Drizzle tables deleted. `StudySession` / `NewStudySession` / `StudySessionDoc` / `UserDoc` types, `toEpochSeconds` / `fromEpochSeconds`, `toStudySession` / `fromStudySession` / `toUpdateDoc`, `escapeRegex` |
| `db/indexes.ts` | **New.** `ensureIndexes()` — 4 `studySessions` + 3 auth indexes, idempotent |
| `scripts/create-indexes.ts` | **New.** `npm run db:indexes` |
| `lib/auth.ts` | `mongodbAdapter(db, { usePlural: false })` + `advanced.database.generateId` |
| `lib/queries.ts` | All 8 fns on the native driver; 3 analytics fns on `$group`; `getDashboardSummary` on `Promise.all`; escaped `$regex` search |
| `lib/actions.ts` | All 7 mutations; `E11000` → `ACTIVE_SESSION_EXISTS` |
| `app/api/export/route.ts` | Native driver; CSV streamed through a cursor instead of materializing history + row array + joined string |
| `scripts/seed.ts` | Native driver, then **deleted** — it ran `deleteMany({userId})` first, so it wiped the target account's real sessions to make room for demo data. See §13.5 |
| `scripts/verify-e2e.ts` | Rewritten, and extended from 11 `console.assert` calls to 28 checks that **exit non-zero** on failure |
| `package.json` | `+mongodb`, `+tsx`/`+dotenv` promoted to devDeps, `−drizzle-orm`/`−drizzle-kit`/`−@libsql/client`/`−better-sqlite3`/`−@types/better-sqlite3`/`−@better-auth/drizzle-adapter`; `db:generate`+`db:push` → `db:indexes` |
| deleted | `drizzle.config.ts`, `drizzle/` (incl. `meta/`) |

`.env.local` was left untouched on purpose — the `TURSO_*` variables are still there but are
now read by nothing. `.env.example` was updated to `MONGODB_URI`.

### 13.2 Decisions taken during implementation

1. **Search: `$regex`, not `$text`** (§5.1). A `$text` query cannot be sorted by anything but
   relevance score, and `getSessions` always orders by `startedAt`. Incompatible. The text index
   was dropped; `escapeRegex` + `$regex` with `i` also keeps `LIKE`'s exact substring semantics.

2. **The app creates its own auth indexes.** The plan assumed the adapter's `ensureModelIndexes`
   would handle `user.email`, `user.username` and `session.token`. It does not — a live
   `user` collection came up with `_id_` only. Now created explicitly in `db/indexes.ts`.

3. **`account.password` is scrypt, not bcrypt.** Better Auth 1.7.5 defaults to `node:crypto`
   scrypt (`node_modules/better-auth/dist/crypto/password.mjs`). §4.3 corrected. Moot without a
   migration, but the doc was wrong.

4. **The Phase B "byte-identical `deepEqual`" gate became 28 explicit assertions** in
   `verify-e2e.ts` instead — including a direct assertion that `startedAt` is stored as a BSON
   `Date` at the right instant and reads back as the same epoch seconds, which is the specific
   bug class §2.6 warned about.

5. **`verify-e2e.ts` now fails loudly.** The old harness used `console.assert`, which prints and
   continues; the script exited 0 even with failing checks. It now counts failures and
   `process.exit(1)`.

6. **The concurrency test was inverted.** It used to insert two active sessions on purpose and
   assert `getActiveSession` happened to return the first — which proved nothing. It now asserts
   the second insert throws `E11000`, and calls `ensureIndexes()` first so it is self-sufficient.

7. **The UTC/local day-bucketing bug was ported, not fixed** (§5.2), as recommended. It is
   documented in `docs/DB_SCHEMA.md` as a known bug with a pointer to fix it separately.

### 13.3 Verification results

Against a live Atlas cluster.

**Static:** `npm run build` clean · `tsc --noEmit` clean · `npm run lint` clean · no remaining
references to `drizzle` / `libsql` / `turso` / `better-sqlite3` in any source file.

**Schema:** signup through the real form produced `user._id` = `"7b1c4ae9-d947-454a-9654-cedfa9f70010"`
— a string UUID, not `ObjectId` hex, confirming the `generateId` override took effect. `emailVerified`
is a real `boolean`. `createdAt` / `session.expiresAt` are BSON `Date`. `account.userId` and
`session.userId` are both string-equal to `user._id`. Collections present: `account`, `user`,
`session`, `studySessions` — singular for auth, no `session`/`sessions` collision.

**Indexes:** `npm run db:indexes` created all 7 and re-ran clean. The
`partialFilterExpression: { status: { $in: [...] } }` form is accepted by the cluster.

**Harness:** `npm run test:e2e -- --user mongotest` → 28/28, including the unique index
rejecting a second active session and the BSON `Date` ↔ epoch-seconds round-trip.

**Real UI (Chromium):** login → start session → pause → resume → finish, 12/12. The finished
session landed at `duration=6s paused=4s` — real elapsed-minus-paused arithmetic derived from a
BSON `Date` `updatedAt`, which is exactly the §2.6 failure mode, working. It appeared in
`/sessions` and `/analytics` with no `NaN`, `1970`, `undefined`, or `Invalid Date` anywhere.
All four pages returned 200.

**Exports:** `?format=json` returns epoch seconds in the same shape as the Drizzle version.
`?format=csv` returns the correct header, 7 lines, and `Content-Disposition`.

### 13.4 Not done — deliberately

- `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` left in `.env.local`, at the user's request. No code
  reads them.
- The 5 pre-migration study sessions were not re-entered.

### 13.5 Removed after the fact: `scripts/seed.ts`

Deleted at the user's request. It was not merely unnecessary — it was a data-loss trap:

```ts
await studySessions.deleteMany({ userId });   // line 31: destroys ALL real sessions
await studySessions.insertMany(sampleData);   // then inserts 6 fake ones
```

`npm run seed -- --user rakesh` would have silently replaced the user's entire study history with
six fabricated sessions, with no backup. Harmless only while the account was empty.

`scripts/verify-e2e.ts` has the same line 61 wipe and was **left in place** by explicit choice. It
is still destructive: it requires a real account, deletes that account's sessions at start and
end, and leaves zero. The README now carries a warning to point it at a throwaway account.

### 13.6 Username uniqueness: two gaps found and fixed after the rewrite

Probed the real indexes on a live cluster rather than trusting the spec, which surfaced two
problems the original plan never considered.

**Gap 1 — the index is case-sensitive.** Verified:

```
rakesh   ALLOWED
Rakesh   ALLOWED      <-- can coexist
RAKESH   ALLOWED
```

The zod schema allowed uppercase (`^[a-zA-Z0-9_.-]+$`, `.trim()` but no `.toLowerCase()`), and
Better Auth lowercases email in several places but **never username** — confirmed by grepping
`node_modules/better-auth/dist/`. So `Rakesh` could sit alongside `rakesh`, and a user who
registered `Rakesh` could never log in as `rakesh`.

Fixed in the schema: `.trim().toLowerCase()` now runs *before* the length and charset checks
(zod 4.6.5 composes the transforms in order — verified `"  RaKeSh  "` → `"rakesh"`).

**The trap:** all three actions were passing the raw `formData` string to Better Auth, not
`parsed.data`. Adding `.toLowerCase()` to the schema alone would have been a **silent no-op** —
the schema would have validated lowercase and then discarded it. All three now read `parsed.data`.

**Gap 2 — a plain unique index allows only one document with the field missing.** Missing fields
index as `null`, so the second username-less user failed `E11000`:

```
no username field (1st)   ALLOWED
no username field (2nd)   BLOCKED (11000)
```

Unreachable through the signup form (the schema demands ≥3 chars) but reachable by POSTing to
`/api/auth/sign-up/email` with just email and password. Fixed with
`partialFilterExpression: { <field>: { $type: "string" } }` on `user_email_idx`,
`user_username_idx` and `session_token_idx`. After: both username-less documents `ALLOWED`, while
duplicate present values still `BLOCKED (11000)`.

**A collation index was rejected deliberately.** It would enforce case-insensitivity in the
database, but a collation index is only used by queries carrying the same collation, and Better
Auth issues `findOne({ username })` without one — the index would be silently bypassed and
decorative. Residual gap: a username written via the raw auth HTTP API bypasses the zod schema
and could be stored mixed-case, making it unloginable through the form.

**`ensureIndexes` was made self-healing.** Changing an index's spec under an existing name makes
`createIndexes` abort with `IndexOptionsConflict` (85) — which is exactly what making these
partial did. `reconcileIndexes` now compares each desired spec against the live one (key, unique,
partialFilterExpression) and drops only the ones that drifted. Verified: the run that applied the
partial specs succeeded silently, and a second run was a no-op.
