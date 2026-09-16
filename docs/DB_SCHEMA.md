# Database Schema

## Database

- **Database:** SQLite
- **ORM:** Drizzle ORM
- **Purpose:** Store coding/study sessions and basic tracking data.
- **Users:** Single user
- **Authentication:** Not required for V1

---

## Sessions

The `sessions` table is the core of the application.

Each row represents one completed or currently active study session.

| Column | Type | Nullable | Default | Description |
|---|---|---:|---|---|
| `id` | text | No | UUID | Unique session ID |
| `subject` | text | No | - | Subject being studied |
| `topic` | text | Yes | `null` | Specific topic |
| `started_at` | integer | No | - | Session start timestamp |
| `ended_at` | integer | Yes | `null` | Session completion timestamp |
| `duration_seconds` | integer | No | `0` | Actual focused time |
| `paused_seconds` | integer | No | `0` | Total paused time |
| `status` | text | No | `active` | `active`, `paused`, or `completed` |
| `outcome` | text | Yes | `null` | What was accomplished |
| `goal` | text | Yes | `null` | Optional session goal |
| `notes` | text | Yes | `null` | Optional notes |
| `created_at` | integer | No | current time | Record creation time |
| `updated_at` | integer | No | current time | Last modification time |

---

## Status

Allowed values:

```text
active
paused
completed
```

### `active`

The session is currently running.

### `paused`

The session exists but the timer is temporarily stopped.

### `completed`

The session has been finished and its final duration has been recorded.

---

## Outcome

Outcome is free-form text for V1.

Examples:

```text
Learned
Revised
Solved problems
Built something
Practiced
```

Do not create a separate `outcomes` table.

---

# Schema

```text
sessions
────────────────────────────────────
id                  TEXT PRIMARY KEY
subject             TEXT NOT NULL
topic               TEXT
started_at          INTEGER NOT NULL
ended_at            INTEGER
duration_seconds    INTEGER NOT NULL DEFAULT 0
paused_seconds      INTEGER NOT NULL DEFAULT 0
status              TEXT NOT NULL DEFAULT 'active'
outcome             TEXT
goal                TEXT
notes               TEXT
created_at          INTEGER NOT NULL
updated_at          INTEGER NOT NULL
```

---

# Why There Is No Subject Table

For V1, subjects are stored directly on the session.

Example:

```text
subject = "DSA"
topic   = "Binary Search"
```

rather than:

```text
subjects
topics
sessions
```

The application has one user and a relatively small amount of data.

A separate subject/topic system would add complexity without providing meaningful value yet.

If the application later needs:

- Subject management
- Subject colors
- Subject icons
- Subject ordering
- Subject goals
- Topic completion
- Subject-specific settings

then subjects/topics can be normalized into separate tables.

---

# Timestamps

Store timestamps as Unix timestamps.

Example:

```text
started_at = 1789553400
```

The application converts timestamps to the user's local timezone when displaying them.

Do not store formatted dates such as:

```text
"2026-09-16 10:30 AM"
```

in the database.

---

# Duration

All durations are stored in seconds.

Example:

```text
duration_seconds = 3720
```

The UI converts this to:

```text
1h 02m
```

This keeps calculations simple and avoids storing presentation-specific values.

---

# Timer Rules

The timer should calculate focused time based on timestamps rather than relying on a counter.

Conceptually:

```text
focused time =
elapsed time - paused time
```

The frontend may update the displayed timer every second, but the database should store the final calculated duration.

---

# Active Session

Only one active session should exist at a time.

Before starting a new session:

```text
Check for existing active/paused session
        ↓
If one exists
        ↓
Resume it or ask the user to finish it
```

Do not allow multiple simultaneous active sessions in V1.

---

# Indexes

Only add indexes that support actual queries.

Recommended:

```text
sessions.started_at
sessions.status
sessions.subject
```

These support:

- Recent sessions
- Date-based filtering
- Finding the active session
- Subject analytics

Do not add indexes everywhere.

---

# Future Tables

Do not create these in V1.

Potential future additions:

```text
daily_goals
settings
session_pauses
```

Only introduce them when an actual feature requires them.

---

# V1 Principle

The database should remain intentionally small.

The core relationship is:

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

One table is enough for the first version.