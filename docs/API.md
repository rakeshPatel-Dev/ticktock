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
5. Return the created session.

### Example

```ts
await createSession({
  subject: "DSA",
  topic: "Binary Search",
  goal: "Solve 5 problems",
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

# 3. Pause Session

### Server Action

```ts
pauseSession(id)
```

Pauses the currently running session.

### Behavior

- Verify session exists.
- Verify session is `active`.
- Record the pause state.
- Update `status` to `paused`.
- Update `updated_at`.

The paused time should not contribute to `duration_seconds`.

---

# 4. Resume Session

### Server Action

```ts
resumeSession(id)
```

Resumes a paused session.

### Behavior

- Verify session exists.
- Verify session is `paused`.
- Record the resume time.
- Update `status` to `active`.

---

# 5. Finish Session

### Server Action

```ts
finishSession(id)
```

Completes a session.

### Input

```ts
{
  outcome?: string
  notes?: string
}
```

### Behavior

1. Verify the session exists.
2. Calculate final focused duration.
3. Set `ended_at`.
4. Set `duration_seconds`.
5. Store outcome and notes.
6. Set `status = "completed"`.
7. Update `updated_at`.

### Example

```ts
await finishSession(sessionId, {
  outcome: "Solved problems",
  notes: "Solved 6 binary search problems.",
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
getDailyAnalytics(userId, targetDate?, timeZone?)
```

### Input

The week (Monday–Sunday) containing `targetDate`, bucketed by calendar day **in `timeZone`**.

```ts
{
  targetDate: Date      // defaults to now
  timeZone: string      // IANA zone; defaults to the server's own
}
```

`timeZone` is not decoration. The range bounds and the `$dateToString` bucket keys must be produced
with the same zone, or a session can be matched by the range and then filed under a key the range
never contained — which drops the minutes instead of showing them on the wrong bar. Callers get the
user's zone from `lib/session.ts#getUserTimeZone`.

### Response

```ts
[
  {
    date: "2026-09-15",
    dayLabel: "Tue",
    durationSeconds: 16200,
    sessionCount: 3
  },
  {
    date: "2026-09-16",
    dayLabel: "Wed",
    durationSeconds: 12600,
    sessionCount: 2
  }
]
```

Used for the daily activity chart. Always seven buckets, Monday first, with empty days present as
zeros.

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

The timer does not make a server request every second.

Avoid:

```text
Timer
  ↓
API request every second
  ↓
MongoDB
```

Instead:

```text
Start session
     ↓
Persist start time
     ↓
Client calculates display time
     ↓
Pause / Resume events persisted
     ↓
Finish session
     ↓
Calculate final duration
     ↓
Persist result
```

The displayed timer may update every second, but the database should not.

---

# 17. Timer Calculation

Focused duration should be based on timestamps.

Conceptually:

```text
focused duration
=
current/end time
-
started time
-
paused duration
```

The displayed timer is therefore derived from actual timestamps rather than an incrementing counter.

This prevents timer drift caused by browser throttling or delayed JavaScript execution.

---

# 18. Active Session Recovery

If the user refreshes the browser:

```text
Browser refresh
      ↓
getActiveSession()
      ↓
Session exists?
      │
   ┌──┴──┐
   │     │
  Yes    No
   │     │
Restore  Idle
timer
```

The application must never depend on React state alone to know whether a session exists.

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
pauseSession()
resumeSession()
finishSession()
updateSession()
deleteSession()
getSessions()
getDashboardSummary()
getDailyAnalytics()
getSubjectAnalytics()
getTopicAnalytics()
```

That's enough to power the entire first version.