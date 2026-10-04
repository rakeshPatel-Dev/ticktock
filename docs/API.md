# API

## Overview

TickTock uses Next.js server-side functionality with the official MongoDB driver (no ORM).

There is no separate Express backend.

The application primarily uses:

- **Server Actions** for mutations
- **Server-side database queries** for reads
- **Route Handlers** only where an HTTP endpoint is useful

```text
React UI
   │
   ├── Server Actions ──────┐
   │                        │
   └── Server Components ──┤
                            ▼
                       MongoDB driver
                            │
                            ▼
                         MongoDB
```

---

# 1. Sessions

Sessions are the primary resource in the application.

## Create Session

### Server Action

```ts
createSession(data)
```

Creates and starts a new study session.

### Input

```ts
{
  subject: string
  topic?: string
  goal?: string
}
```

### Behavior

1. Check whether an active or paused session already exists.
2. Reject creation if another session is active.
3. Create a new session.
4. Set:
   - `status = "active"`
   - `started_at = current timestamp`
   - `duration_seconds = 0`
   - `paused_seconds = 0`
5. Return the whole session.

### Input

```ts
{
  subject: string
  topic?: string
  goal?: string
  // Epoch seconds, from the user's own clock, at the moment they pressed start.
  startedAt?: number
}
```

`startedAt` is optional. The client owns the clock the timer counts on, so it
owns the start instant too; the server falls back to its own clock when the
client sends nothing, and also when the supplied value is more than
`MAX_START_SKEW_SECONDS` away from the server's or older than a week. See
§16 for why.

### Response

```ts
StudySession
```

The full session, not just its id, so the client can start its timer on the click
instead of waiting for the revalidation that follows the insert.

### Example

```ts
await createSession({
  subject: "DSA",
  topic: "Binary Search",
  goal: "Solve 5 problems",
  startedAt: Math.floor(Date.now() / 1000),
})
```

---

# 2. Get Active Session

### Server Function

```ts
getActiveSession()
```

Returns the current active or paused session.

### Response

```ts
StudySession | null
```

Used when:

- Dashboard loads
- Application refreshes
- Browser is reopened

The client should use this to recover an active session.

---

# 3. Pause and Resume

**Neither is a server action any more.** Pausing and resuming are pure local
transitions in `lib/timer-store.ts`; they make no request at all.

```ts
import { pause, resume } from "@/lib/timer-store";

pause();
resume();
```

A row is `active` for the whole of its life and flips to `completed` once, at
the end. Nothing derives a duration from `status` any more, and `pausedAt` is
only read to rebuild rows that were written before the client took over the
clock.

The reason is not fewer round trips for their own sake. Pause and resume used to
be optimistic local updates standing in for a server value, and being optimistic
is what made them wrong: the optimistic object set `status` without the pause
anchor, so the display collapsed to `00:00:00` on every pause and jumped forward
by the length of the pause on every resume, then snapped back when the
revalidation landed. With no server value to imitate there is no window in which
the two can disagree.

---

# 5. Finish Session

### Server Action

```ts
finishSession(id, input)
```

Completes a session. The last request in a session's life.

### Input

```ts
{
  outcome?: string
  notes?: string
  // Focused seconds, measured and floored by the client.
  durationSeconds?: number
  // The paused-seconds complement, banked across every pause.
  pausedSeconds?: number
}
```

The client is the clock, so the client supplies the focused total. Both are
optional, so a client that sends neither still lands a coherent row.

### Behavior

1. Verify the session exists.
2. Set `ended_at` to the server's clock.
3. Clamp `duration_seconds` to the wall-clock span `ended_at - started_at`.
4. Clamp `paused_seconds` so `duration + paused <= span`.
5. Store outcome and notes.
6. Set `status = "completed"`.
7. Update `updated_at`.

Steps 3 and 4 are not a trust boundary — this is a personal tracker, the user is
the only party, and there is nothing to cheat. They guard a *wrong clock*: an
uncorrected system clock hours out would otherwise write a nonsense duration into
the record, and from there into every daily total, every subject average, and
every streak the user ever looks at.

A row that is still `paused` skips all of that and derives both totals from its
own `pausedAt` anchor, because such a row is always a legacy one and has enough
information to be exact without any client input.

### Response

```ts
{ durationSeconds: number }
```

The value actually stored, after clamping. The finish modal congratulates the
user on *this* number, so the figure on screen and the figure in the record
cannot be different.

### Example

```ts
await finishSession(sessionId, {
  outcome: "Solved problems",
  notes: "Solved 6 binary search problems.",
  durationSeconds: 2712,
  pausedSeconds: 300,
})
```

---

# 6. Update Session

### Server Action

```ts
updateSession(id, data)
```

Used for correcting completed sessions.

### Input

```ts
{
  subject?: string
  topic?: string
  goal?: string
  outcome?: string
  notes?: string
  durationSeconds?: number
}
```

Only fields supplied by the caller should be changed.

### Errors

```ts
{ success: false, error: "SESSION_NOT_FOUND" }
```

Returned when the `updateOne` matched nothing — the row is gone or belongs to another user. It
checks `matchedCount`, not `modifiedCount`: a save where the user changed nothing is a real,
owned, present session and also reports `modifiedCount: 0`, so testing that would report
"not found" for the most ordinary edit. The caller must keep its form open on this result instead
of treating it as a success.

---

# 7. Delete Session

### Server Action

```ts
deleteSession(id)
```

Permanently deletes a session.

Used for:

- Accidental sessions
- Test sessions
- Incorrect records

The UI should ask for confirmation before calling this action, and must not close the confirmation
on `SESSION_NOT_FOUND` — the row is still there.

### Errors

```ts
{ success: false, error: "SESSION_NOT_FOUND" }
```

Returned when the `deleteOne` deleted nothing.

---

# 8. List Sessions

### Server Function

```ts
getSessions(options)
```

Returns historical sessions.

### Input

```ts
{
  from?: Date
  to?: Date
  subject?: string
  limit?: number
}
```

### Example

```ts
await getSessions({
  from: startOfWeek(new Date()),
  to: new Date(),
})
```

### Response

```ts
StudySession[]
```

Sessions should be returned newest first by default.

---

# 9. Analytics

Analytics should be calculated from the `sessions` table rather than stored separately.

---

## Daily Analytics

### Server Function

```ts
getDailyFocus(userId, range?, timeZone?)
```

### Input

```ts
{
  range?: { from?: number; to?: number }   // epoch seconds; omit for all-time
  timeZone?: string                        // IANA zone; defaults to the server's own
}
```

Rows are grouped by calendar day **in `timeZone`**.

`timeZone` is not decoration. The range bounds and the `$dateToString` bucket keys must be produced
with the same zone, or a session can be matched by the range and then filed under a key the range
never contained — which drops the minutes instead of showing them on the wrong bar. Callers get the
user's zone from `lib/session.ts#getUserTimeZone`.

### Response

```ts
[
  {
    date: "2026-09-15",
    durationSeconds: 16200,
    sessionCount: 3
  },
  {
    date: "2026-09-16",
    durationSeconds: 12600,
    sessionCount: 2
  }
]
```

**Sparse**: only days with at least one completed, non-zero session. The dense, gapped axis is built
separately — see below. Making the query dense would mean shipping a zero row for every day of an
unbounded all-time range, which for a multi-year history is thousands of rows the chart cannot show.

### `getHeatmapAnalytics`

An alias of `getDailyFocus` (`export const getHeatmapAnalytics = getDailyFocus`). Same rows, same
query; kept because the grid is the one caller whose name says what the data is for. Do not add a
second aggregation behind it.

---

## Analytics Ranges

`lib/analytics-range.ts`. Pure functions — no database, no session — so they are directly testable
against fixed dates.

### The four ranges

| `range` | Bucket unit | Bar count | Axis source |
| --- | --- | --- | --- |
| `week` | day | 7 | Sunday → Saturday |
| `month` | week | 4–6 | Sunday-aligned columns the month touches |
| `year` | month | 12 | Jan → Dec |
| `all` | month | history length | Derived from the data |

Selection rides on `?range=week|month|year|all`. The default (`week`) renders at the bare
`/analytics` URL, so the common case stays clean and shareable.

### Functions

```ts
isAnalyticsRange(value: unknown): value is AnalyticsRange
resolveAnalyticsRange(range, reference, timeZone): AnalyticsRangeSpec
foldDaysIntoBars(days: DailyFocusDay[], axis: BarSpec[], unit: BucketUnit): Bar[]
deriveMonthAxis(days: DailyFocusDay[], todayKey: string): BarSpec[]
labelStride(count: number): number
describeAxis(axis: BarSpec[], unit: BucketUnit): string
```

### `resolveAnalyticsRange`

Returns `{ range, label, unit, from, to, axis }`, where `from`/`to` are epoch seconds.

- `axis` is `null` **only** for `all`, because its axis depends on where the user's history starts
  and the server cannot know that before querying. Callers pass `spec.axis ?? deriveMonthAxis(...)`.
- `from` is `undefined` **only** for `all`. `startedAtInRange` reads `undefined` as unbounded, so the
  filter must be spread (`{ from, to }`) rather than passed whole.
- Month bounds are computed from the user's zone, so a month containing a DST transition is 743 hours
  and not a flat 720.

### `foldDaysIntoBars`

Gap-fills. A bucket with no sessions becomes a real bar with `durationSeconds: 0`, because omitting it
would shift every later bar left and make an empty month look like a busy one.

Totals are summed off the folded bars, never off the raw days, so the tiles can never disagree with
the chart directly beneath them.

### `labelStride` and `describeAxis`

`labelStride` is the starting guess, derived from bar count alone. The chart then measures the labels
it actually rendered and widens the stride until they fit — see `fitLabelStride` in
`components/analytics-view.tsx`. Count alone is not sufficient: twelve month labels of `Nov '25` fit
a laptop and wrap on a phone.

`describeAxis` derives the caption from the axis so it cannot contradict the bars beneath it. A
single-bar axis returns that bar's own label rather than a degenerate `Oct 2026 – Oct 2026` — a real
case, since an all-time view whose history fits inside one month is exactly what a new user sees.

---

# 10. Subject Analytics

### Server Function

```ts
getSubjectAnalytics(range)
```

### Response

```ts
[
  {
    subject: "DSA",
    durationSeconds: 42120,
    sessionCount: 11,
    percentage: 69
  },
  {
    subject: "DBMS",
    durationSeconds: 19200,
    sessionCount: 5,
    percentage: 31
  }
]
```

Used to display time distribution by subject. Sorted by `durationSeconds` descending, then by
`subject` — the tie-breaker is required, or two subjects with equal totals can swap places between
page loads.

Subjects are grouped case- and whitespace-insensitively, so `"Python"`, `"python"` and
`"  pYtHoN  "` are one row with the summed time, and `subject` is the most recent spelling the user
typed. The fold happens at read time, not on write, which is why historical duplicates merge
without a migration — see `lib/subjects.ts`.

---

# 11. Topic Analytics

### Server Function

```ts
getTopicAnalytics(range)
```

### Response

```ts
[
  {
    subject: "DSA",
    topic: "Binary Search",
    durationSeconds: 7800
  },
  {
    subject: "DSA",
    topic: "Trees",
    durationSeconds: 15420
  }
]
```

---

# 12. Dashboard Summary

Instead of making many separate database requests from the dashboard, provide one server-side query/function for the main summary.

### Server Function

```ts
getDashboardSummary(userId, targetDate?, timeZone?)
```

`timeZone` decides which calendar day "today" means — the user's midnight, not the server's, so a
10 PM session in IST still counts toward the user's today.

### Response

```ts
{
  totalFocusedSeconds: number
  sessionCount: number
  subjectCount: number
  longestSessionSeconds: number
  recentSessions: StudySession[]
  activeSession: StudySession | null
}
```

This keeps the dashboard simple.

---

# 13. Route Handlers

Route Handlers are **not required for the core application flow**.

If HTTP endpoints are needed later, they can be added under:

```text
app/api/
```

Potential endpoints:

```text
GET    /api/sessions
POST   /api/sessions
GET    /api/sessions/[id]
PATCH  /api/sessions/[id]
DELETE /api/sessions/[id]

GET    /api/analytics/daily
GET    /api/analytics/subjects
GET    /api/analytics/topics
```

These should call the same underlying database functions used by Server Actions.

Do not duplicate database logic inside Route Handlers.

---

# 14. Validation

All inputs coming from the client must be validated server-side.

Use Zod for validation.

Example:

```ts
const subjectField = z
  .string()
  .trim()
  .min(1, "Subject is required")
  .max(100)
  .transform(normalizeSubject)

const createSessionSchema = z.object({
  subject: subjectField,
  topic: z.string().trim().max(200).optional(),
  goal: z.string().trim().max(300).optional(),
})
```

`.trim()` is zod's own transform, so a whitespace-only subject still fails `.min(1)`. The extra
`normalizeSubject` collapses internal whitespace runs — otherwise a pasted "Data  Structures" and a
typed "Data Structures" become two subjects. Casing is left alone on purpose (`DSA` is not "Dsa");
the case-insensitive comparison lives on the read side.

The server must never assume that client-side validation is sufficient.

---

# 15. Error Handling

Server Actions should return predictable errors.

Example:

```ts
{
  success: false,
  error: "ACTIVE_SESSION_EXISTS"
}
```

Possible errors:

```text
ACTIVE_SESSION_EXISTS
SESSION_NOT_FOUND
INVALID_SESSION_STATE
SESSION_ALREADY_COMPLETED
UNAUTHORIZED
INVALID_INPUT
DATABASE_ERROR
```

The UI should translate these into human-readable messages. `lib/action-errors.ts` is that
translation in one place, so a new action cannot invent a second wording for the same code. Zod
messages are returned as-is and are not in the table: an unknown string is a human message and is
passed through.

Example:

```text
You already have a session running.
Finish or resume it before starting another.
```

An action that fails must not leave the UI claiming success. Pause/resume apply optimistically and
revert on failure; the finish and edit modals keep their form open and show the error. A swallowed
`ActionResult` is indistinguishable from a successful write, and the user is the one who finds out
later.

Do not expose raw database errors to the user.

---

# 16. Timer Architecture

The timer makes **two** requests per session, ever: one to open it and one to
close it. Everything in between is local.

```text
Start ──► createSession()          one insert, so the one-active-session
              │                    invariant is enforced up front
              ▼
         ┌──────────────────────────────────────────┐
         │  lib/timer-store.ts — no network         │
         │                                          │
         │  elapsed = accumulated + (now - anchor)  │
         │                                          │
         │  pause / resume ──► local transitions    │
         │  reload      ──► checkpoint, then restore│
         └──────────────────────────────────────────┘
              │
              ▼
Finish ─► finishSession()         one update, carrying the duration
```

The old shape was three transitions, three requests, and a pause anchor that had
to survive a round trip. Two requests is the floor: a row has to exist before
the timer can own it, and the record cannot exist without the duration.

### The two clocks

| Clock | Used for | Why |
| --- | --- | --- |
| `performance.now()` | the open run segment | Monotonic. Immune to NTP corrections, DST, timezone changes, and a user editing their system clock mid-session. |
| `Date.now()` | checkpointing a segment | The only clock that survives a reload, because `performance.now()` restarts from zero on every navigation. |

The read path touches the monotonic clock; the write path touches the wall clock
exactly once, when a segment is checkpointed. A system clock change mid-session
therefore cannot move the display.

### Rendering

`requestAnimationFrame`, not `setInterval`. Browsers suspend rAF entirely in a
hidden tab, so a backgrounded session costs nothing instead of waking up ten
times a second, and the first frame after the tab is shown is already correct —
elapsed is recomputed from the anchor, never decremented. The store republishes
only when the floored second changes, so the timer re-renders about once a second
rather than once a frame.

Each digit animates independently when it changes, reusing `AnimatedGlyph` from
`components/animated-glyph.tsx`. The seconds digits roll every second; the
minutes and hours digits sit still and only roll when they turn over. Animating
per glyph rather than per string is what makes that read as a clock rather than a
flickering number, and the glyphs sit in a fixed-width monospaced grid so a
vertical swap cannot shove its neighbours sideways.

Only the glyph is reused. The animation used to live in a larger countdown
component that computed its own remaining time from a `targetDate` on its own
`setInterval`; this timer counts *up from* an instant the store already owns, so
that clock had to go. What is left is the part that is just an animation.

`aria-live` is off and the accessible name sits on the wrapper instead. A live
region would announce the new time on every tick, which for a one-hour session
means an hour of a screen reader narrating numbers nobody asked for.

---

# 17. Timer Calculation

Elapsed time is derived from timestamps. Never counted.

```text
running:  elapsed = accumulated + (monotonicNow - segmentStartedAt)
paused:   elapsed = accumulated
```

Consequences that are asserted in `scripts/verify-e2e.ts`:

- **Sampling rate is irrelevant.** Reading it at 10Hz, at 1Hz, or three times in
  thirty seconds gives the same answer at the same instant. This is what a
  throttled or suspended tick loop depends on, and what a `setState(elapsed + 100)`
  design cannot provide.
- **Pause freezes the number** and banks the open segment. Pausing twice does not
  bank it twice; starting twice does not discard what was banked.
- **A reload does not reset anything.** A checkpoint records the open segment's
  wall-clock start; restoring folds the elapsed achieved while the tab was gone
  into a fresh monotonic anchor and reads the wall clock exactly once.

---

# 18. Active Session Recovery

Three cases, and the order matters:

```text
              ┌──────────────────────────────┐
              │ localStorage checkpoint?     │
              └───┬──────────────────────┬───┘
             yes  │                      │ no
                  ▼                      ▼
        about this same row?      ──► adopt the server's row,
                  │                elapsed = now - started_at
           ┌──────┴───────┐          (no pause state exists
           │              │           to recover)
          yes             no
           │              │
           ▼              ▼
    use it — it holds   server's row is gone
    the pause state     (finished elsewhere, deleted,
    the server never    or "Reset data"): drop it
    heard about
```

The store lives outside React, so a route change does not reset anything either —
`Timer` is only mounted on `/`, and navigating to `/analytics` and back used to
mean a fresh mount.

An RSC revalidation hands the timer a brand new `initialSession` object after
every mutation. The server has no idea the user paused, so the store refuses to
overwrite a record it already holds unless the server is pointing at a different
row.

Skipping that reconcile when the remote id is unchanged is an optimisation — it
stops a refresh from re-reading `localStorage` and re-sealing the anchor every
time. It is not allowed to skip the one case that has real work to do: the remote
being `null` while a local record exists. `null` means both "nothing is open" and
"the row you were holding is gone", and conflating them left a timer counting
against a deleted session. See `canSkipReconcile` and ISSUES #13.

### What the server may not render

The server cannot know the elapsed time, and must not pretend otherwise. The real
number depends on `performance.now()`, on `localStorage`, and on whether the user
paused — and the server is never told about the last one. Computing
`now - startedAt` from an `active` row renders a confident wrong figure: loading a
session paused at 36 seconds showed `00:00:58` and then settled on `00:00:36`,
with React reporting a hydration mismatch and rebuilding the tree.

So `getServerSnapshot` and `getClientSnapshot` are different functions. Both
return the same constant until an effect after hydration runs, and the
running/paused card renders a `--:--:--` placeholder for those few frames. The
idle hero is **not** gated — with no session it is a pure function of
`initialSession === null`, and gating it too just hid "Ready to focus?" on every
load.

The application must never depend on React state alone to know whether a session
exists — nor on the server alone to know whether the user is paused, and never
expect the two to render the same number.

---

# 19. Concurrency Rule

Only one session may be active or paused at a time.

Before creating a session:

```text
Check active/paused session
        ↓
      Exists?
      /     \
    Yes      No
     ↓        ↓
   Reject    Create
```

This rule should be enforced server-side.

---

# 20. API Design Principles

### Keep it small

Do not create endpoints for every tiny UI operation.

### Server is authoritative

The client can display timer state, but the database is the source of truth for persisted sessions.

### No unnecessary abstraction

Do not create:

```text
Controller
Service
Repository
DTO
Mapper
```

layers unless the application actually becomes complex enough to need them.

### Shared logic

Database operations should live in reusable server-side functions.

Server Actions and Route Handlers should call those functions rather than duplicate logic.

---

# 21. Initial API Surface

The actual V1 API is intentionally small:

```text
createSession()
getActiveSession()
finishSession()
updateSession()
deleteSession()
getSessions()
getDashboardSummary()
getDailyFocus()
getSubjectAnalytics()
getTopicAnalytics()
```

That's enough to power the entire first version.