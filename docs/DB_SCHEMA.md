# Database Schema

## Database

- **Database:** MongoDB (Atlas in production)
- **Driver:** `mongodb` (official Node driver) — no ORM
- **Purpose:** Store coding/study sessions and basic tracking data.
- **Authentication:** Better Auth, four adapter-owned collections

> Superseded the SQLite/Drizzle schema. The design rationale below is unchanged; only
> the storage shape moved. See `docs/MONGO_MIGRATION_PLAN.md` for the rewrite plan.

---

## Collections

### `studySessions` — owned by this app

Renamed from the `sessions` SQL table to avoid a one-letter collision with Better Auth's
`session` collection.

| Field | BSON type | Nullable | Description |
|---|---|---:|---|
| `_id` | string | No | `crypto.randomUUID()` |
| `userId` | string | Yes | Owning user; `null` for orphans |
| `subject` | string | No | Subject being studied |
| `topic` | string | Yes | Specific topic |
| `startedAt` | Date | No | Session start |
| `endedAt` | Date | Yes | Session completion |
| `durationSeconds` | int32 | No | Actual focused time; defaults `0` |
| `pausedSeconds` | int32 | No | Total paused time; defaults `0` |
| `status` | string | No | `active`, `paused`, or `completed`; defaults `active` |
| `pausedAt` | Date | Yes | Start of the **current** pause; `null` when not paused |
| `outcome` | string | Yes | What was accomplished |
| `goal` | string | Yes | Optional session goal |
| `notes` | string | Yes | Optional notes |
| `createdAt` | Date | No | Record creation |
| `updatedAt` | Date | No | Last modification. **Never** a duration input |

### `user`, `session`, `account`, `verification` — owned by Better Auth

Do not hand-write writes against these. Better Auth's mongo adapter creates and manages them,
including `account.password` (the credential hash) and `session.token`.

Collection names are **singular** (`usePlural: false`). `session` (auth) and `studySessions`
(app) are distinct collections.

`_id` is a **string** on all five collections. `lib/auth.ts` sets
`advanced.database.generateId = () => crypto.randomUUID()`, which makes the adapter skip its
default `ObjectId` coercion and match the app's own UUID convention.

---

## Timestamps: two units, one boundary

MongoDB's native date type is BSON `Date`, which is **milliseconds**. The domain layer speaks
epoch **seconds**, because `lib/timer.ts` and four components are built against that contract.

`db/schema.ts` owns the conversion in both directions:

```ts
toEpochSeconds(date: Date): number        // Math.floor(date.getTime() / 1000)
fromEpochSeconds(seconds: number): Date   // new Date(seconds * 1000)
```

**Every read must go through `toStudySession` and every write through `fromStudySession` /
`toUpdateDoc`.** Nothing in the type system distinguishes seconds from milliseconds at the
boundary — `StudySessionDoc.startedAt` is a `Date` and `StudySession.startedAt` is a `number`,
but a stray `* 1000` is a silent bug that only surfaces as an empty analytics page.

### `pausedAt` is legacy, and only read

**No code path writes `pausedAt` any more.** Pausing is local state in `lib/timer-store.ts` and
never reaches the database, so a row is `active` for its whole life and flips to `completed` once.
The field is read in exactly two places, both for rows that predate that change:

- `db/schema.ts#pauseAnchorSeconds` — the sanctioned reader.
- `lib/timer-store.ts#adoptFromServer` — rebuilding a live timer for a `paused` row it finds in
  the database.
- `lib/actions.ts#finishSession` — deriving exact totals for a `paused` row, which has enough
  information on its own and so needs no client input.

A `paused` row is now necessarily a legacy one, which is what makes those three call sites total
rather than merely likely.

It used to be overloaded onto `updatedAt`, which held only while pause/resume was the sole writer
of that field. Editing the subject, notes, or goal of a **paused** session moved the anchor forward
and silently under-counted the pause — the same `updatedAt` on a `completed` row was then read as a
pause start the next time the row was touched. Nothing about the field being editable was guarded;
only the absence of a second writer was assumed.

`pauseAnchorSeconds` falls back to `updatedAt` for a paused document written before `pausedAt`
existed, so the fix is safe to deploy ahead of the data. `npm run db:backfill-paused-at` pins those
rows (`pausedAt = updatedAt`) and is idempotent; once it has run, the fallback arm is dead code kept
only for databases that skipped the script.

Asserted in `scripts/verify-e2e.ts`: the anchor survives an edit made mid-pause, a completed session
has no anchor, and a legacy document still resolves one.

---

## Status

```text
active
paused
completed
```

- `active` — the session is currently running.
- `paused` — the session exists but the timer is temporarily stopped.
- `completed` — finished, and its final duration has been recorded.

The enum is unenforced at the database level, exactly as the SQL `text(..., { enum })` was.

---

## Outcome

Outcome is free-form text. Do not create a separate `outcomes` collection.

---

# Why There Is No Subject Collection

Subjects are stored directly on the session.

```ts
subject = "DSA"
topic   = "Binary Search"
```

rather than separate `subjects` / `topics` collections. If the application later needs subject
management, colors, icons, ordering, per-subject goals, or settings, normalize then — not before.

## Subject identity without a collection

No collection does not mean no identity. There is one rule, in two halves, and both live in
`lib/subjects.ts`:

- **Stored:** trimmed with internal whitespace collapsed (`normalizeSubject`). Casing is preserved —
  `DSA` and `OB & HRM` are acronyms the user typed on purpose, and title-casing would mangle them.
- **Compared:** case- and whitespace-insensitive (`subjectKey` / `isSameSubject`), folded on the
  server by the same aggregation expression in `getAllSubjects`, `getSubjectAnalytics`,
  `getTopicAnalytics`, and the `getSessions` subject filter.

Folding on the read side is what makes this a fix rather than a rule: `"Python"` and `"python"`
stored months apart become one row and one dropdown entry with no migration. A case-insensitive
collation on `user_subject_idx` would not have done that — it fixes exact-match lookups and nothing
else — and the duplicates were visible in the list and the breakdown, not in the index.

The subject colour in `lib/colors.ts` hashes the same key, so one subject cannot be two colours.

---

# Duration

All durations are stored in seconds.

```ts
durationSeconds = 3720
```

The UI converts this to `1h 02m`. Never store a counter, and never store a formatted string.

The value is measured by the client and sent in `finishSession`, then clamped server-side to the
wall-clock span `endedAt - startedAt` so a wrong system clock cannot write a nonsense duration. The
invariant enforced is the same one as before, in a different place:

```text
durationSeconds + pausedSeconds <= endedAt - startedAt
```

Asserted in `scripts/verify-e2e.ts` as the stopwatch state machine: elapsed is a function of
`now` and the segment anchors, so it is identical at any sampling rate, and it survives a reload
that restarts the monotonic clock at zero.

---

# Active Session

Only one active or paused session may exist per user.

**This is now enforced by the database**, not just by application code:

```js
{ key: { userId: 1, status: 1, startedAt: -1 },
  name: "active_session_uniq",
  unique: true,
  partialFilterExpression: { status: { $in: ["active", "paused"] } } }
```

`createSession` still does a `findOne` first, so the common case returns a clean
`ACTIVE_SESSION_EXISTS` error code rather than surfacing `E11000` to the UI. The index is what
actually holds the line when two requests race — previously both inserts succeeded and
`getActiveSession` merely happened to return the newer one.

---

# Indexes

```js
db.studySessions.createIndexes([
  { key: { userId: 1, startedAt: -1 }, name: "user_started_idx" },
  { key: { userId: 1, status: 1 },   name: "user_status_idx"  },
  { key: { userId: 1, subject: 1 },  name: "user_subject_idx" },
  { key: { userId: 1, status: 1, startedAt: -1 }, name: "active_session_uniq", unique: true,
    partialFilterExpression: { status: { $in: ["active", "paused"] } } },
])

db.user.createIndex({ email: 1 },    { unique: true, partialFilterExpression: { email:    { $type: "string" } } })
db.user.createIndex({ username: 1 }, { unique: true, partialFilterExpression: { username: { $type: "string" } } })
db.session.createIndex({ token: 1 }, { unique: true, partialFilterExpression: { token:    { $type: "string" } } })
```

The `partialFilterExpression` on all three is load-bearing, not decoration. A plain unique index
stores a missing field as `null`, so without it the database permits exactly **one** user with no
username — the second insert fails `E11000`. Verified on a live cluster: two username-less
documents came back `BLOCKED (11000)` before the partial index and `ALLOWED` after. Unreachable
through the signup form, reachable by POSTing straight to `/api/auth/sign-up/email`.

Every real query filters `userId` *and* something else, so the compound indexes serve them
directly — the four single-column SQLite indexes this replaced were planner-dependent.

**These indexes are case-sensitive, and that is deliberate.** `user_username_idx` is a plain
binary index, so the database will accept `rakesh`, `Rakesh` and `RAKESH` as three distinct
accounts. Canonicalisation happens one layer up, in the zod schema in `lib/auth-actions.ts`:
`.trim().toLowerCase()` runs before the length and charset checks, so `RaKeSh` and `  RAKESH  `
both store as `rakesh`, and login normalises identically. Nothing in Better Auth lowercases a
username (it lowercases email in a few places, never username), so without that schema every
lookup would disagree with what the user typed.

A collation index (`{ collation: { locale: "en", strength: 2 } }`) would enforce
case-insensitivity in the database, but it was rejected on purpose: a collation index is only
consulted by queries that carry the same collation, and Better Auth issues its own
`findOne({ username })` without one, so the index would be silently bypassed and effectively
decorative.

Residual gap: a username written directly through the auth HTTP API bypasses the zod schema, so
it can be stored mixed-case and would then be unloginable through the form, since login
normalises. The database cannot catch this without the collation index above.

Run with `npm run db:indexes`. `createIndexes` is a no-op when the index already exists with the
same spec, so it is safe to re-run.

**No text index.** `getSessions` searches with a leading-wildcard pattern, which no B-tree index
can serve. A `$text` index would fix the scan, but `$text` queries cannot be sorted by anything
except relevance score, and `getSessions` always orders by `startedAt`. So search uses an escaped
`$regex` with the `i` flag, which also preserves SQLite `LIKE`'s exact substring semantics.

---

# Analytics

`getSubjectAnalytics`, `getTopicAnalytics` and `getDailyFocus` aggregate server-side with
`$group`. The previous implementation fetched a user's **entire** completed history into JS on
every request — an unbounded memory read that was a latent outage at ~10k sessions per user,
independent of which database backs the app.

`getDashboardSummary`'s three independent reads now run under `Promise.all` rather than in
sequence.

## One week, one zone

Three separate defects used to make the analytics page disagree with itself. All three are fixed in
`lib/timezone.ts` + `lib/queries.ts`, and the rule that came out of them is now the contract:

> **Every query on this page derives its range bounds AND its bucket keys from the same
> `getWeekRange(reference, timeZone)` call.** A range that is zoned and buckets that are not is the
> bug, and it is silent — the minutes are not shown wrong, they are dropped.

- **Buckets were UTC, bounds were local.** `$dateToString` without a `timezone` option formats in
  UTC, so a 9 PM session in IST was keyed as tomorrow's date — a key outside the computed range, and
  its minutes vanished. `$dateToString` now receives `timezone` via `dateToStringOptions(tz)`.
- **Nobody knew the user's zone.** The server cannot; the browser can. `TimezoneSync` (in the root
  layout) writes `Intl.DateTimeFormat().resolvedOptions().timeZone` to the `ticktock_tz` cookie, and
  `lib/session.ts#getUserTimeZone` reads it back — validated, because a cookie is user-writable and a
  bogus value would throw inside the aggregation. Fallback is the server's own zone, so the very
  first request of a visit has no cookie to read — the two pages whose numbers are bucketed by zone
  (`/`, `/analytics`) therefore pass the zone they resolved back to `TimezoneSync`, which calls
  `router.refresh()` once if it differs from the browser's. One refresh, not a loop: after it the
  cookie is present, so the zone matches. The root-layout instance stays prop-less on purpose —
  reading the cookie there would make the static sign-in and sign-up pages dynamic.
- **The subject and topic panels were all-time.** They sit under a "This Week" header, so a user with
  months of history saw every subject mixed into the week view. Both now take an optional
  `RangeFilter`, and the page passes the chart's own week.

Day and week boundaries are computed with `Intl`, not a date library: `date-fns` has no IANA zone
support, and hand-rolled offset tables go wrong on DST. `getDayRange` derives the end of a day from
the start of the *next* day, so a spring-forward day is 23 hours rather than 24. `verify-e2e.ts`
asserts the 23-hour case, the Kolkata-vs-UTC day split, and that the subject panel's total equals
the chart's total for the same week.

---

# V1 Principle

The database should remain intentionally small. One app-owned collection is enough:

```text
                  SESSION
                     │
          ┌──────────┼──────────┐
          ↓          ↓          ↓
       Subject      Topic     Duration
                                │
                         ┌──────┴──────┐
                         ↓             ↓
                      Outcome        Notes
```

Potential future collections — `daily_goals`, `settings`, `session_pauses` — should only be
introduced when an actual feature requires them.
