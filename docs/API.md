# API

## Overview

TickTock uses Next.js server-side functionality with Drizzle ORM and SQLite.

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
                         Drizzle
                            │
                            ▼
                          SQLite
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

The UI should ask for confirmation before calling this action.

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
getDailyAnalytics(range)
```

### Input

```ts
{
  from: Date
  to: Date
}
```

### Response

```ts
[
  {
    date: "2026-09-15",
    durationSeconds: 16200
  },
  {
    date: "2026-09-16",
    durationSeconds: 12600
  }
]
```

Used for the daily activity chart.

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
    durationSeconds: 42120
  },
  {
    subject: "DBMS",
    durationSeconds: 19200
  }
]
```

Used to display time distribution by subject.

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
getDashboardSummary(date)
```

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
const createSessionSchema = z.object({
  subject: z.string().trim().min(1).max(100),
  topic: z.string().trim().max(200).optional(),
  goal: z.string().trim().max(300).optional(),
})
```

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
INVALID_INPUT
DATABASE_ERROR
```

The UI should translate these into human-readable messages.

Example:

```text
You already have a session running.
Finish or resume it before starting another.
```

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
SQLite
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