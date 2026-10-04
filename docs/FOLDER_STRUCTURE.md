# Folder Structure

```text
ticktock/
│
├── app/
│   ├── page.tsx
│   ├── sessions/
│   │   └── page.tsx
│   ├── analytics/
│   │   └── page.tsx
│   ├── settings/
│   │   └── page.tsx
│   │
│   └── api/
│       └── sessions/
│           └── route.ts
│
├── components/
│   ├── timer.tsx
│   ├── start-session.tsx
│   ├── session-list.tsx
│   ├── session-form.tsx
│   ├── dashboard-summary.tsx
│   └── ui/
│
├── db/
│   ├── index.ts
│   └── schema.ts
│
├── lib/
│   ├── actions.ts
│   ├── queries.ts
│   ├── timer.ts
│   └── utils.ts
│
├── scripts/
│   ├── create-indexes.ts
│   └── verify-e2e.ts
│
├── public/
│
├── .env.local
├── next.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Directory Responsibilities

### `app/`

Contains Next.js routes and pages.

```text
app/
├── page.tsx
├── sessions/
├── analytics/
└── settings/
```

`page.tsx` is the main dashboard.

---

### `app/api/`

Only for Route Handlers that actually need an HTTP endpoint.

Do not put all application logic here.

```text
app/api/sessions/route.ts
```

If Server Actions are sufficient for a feature, don't create an API route just for the sake of having one.

---

### `components/`

Application-specific UI components.

```text
components/
├── timer.tsx
├── start-session.tsx
├── session-list.tsx
├── session-form.tsx
├── dashboard-summary.tsx
├── animated-glyph.tsx
└── timezone-sync.tsx
```

Keep components focused on UI and interaction. `timezone-sync.tsx` is the one deliberate exception: it
renders nothing and exists to hand the browser's timezone to the server, which no server component can
discover on its own.

#### `animated-glyph.tsx`

A single glyph that animates when its own value changes, and nothing else. The
timer renders one per character, so the seconds digits roll every second while
the minutes digits sit still.

It is a whole file for roughly thirty lines on purpose. It used to be the
number half of a much larger countdown component — variants, sizes, separators,
`targetDate` arithmetic, a static demo mode, completion callbacks — none of which
anything imported. That component kept its own `setInterval` and computed
remaining time from a `targetDate`, which is a second clock; the timer counts *up
from* an instant the store owns. Keeping the file meant keeping the clock, so the
clock went and the file was renamed to say what is actually in it.

---

### `components/ui/`

shadcn/ui components.

Examples:

```text
button.tsx
dialog.tsx
input.tsx
select.tsx
badge.tsx
card.tsx
progress.tsx
```

These are reusable primitives, not application-specific components.

---

### `db/`

Everything directly related to MongoDB. There is no ORM — the official `mongodb` driver is
used directly.

```text
db/
├── index.ts
├── indexes.ts
└── schema.ts
```

#### `index.ts`

Creates the `MongoClient` singleton (cached on `globalThis` outside production so dev HMR does
not leak connections), the `Db` handle, and the `studySessions` / `users` collection accessors.
Also holds the production guard: `MONGODB_URI` is required and must be a `mongodb://` or
`mongodb+srv://` URL.

#### `indexes.ts`

Idempotent index bootstrap. Run with `npm run db:indexes`. Auth collections are excluded except
for the unique indexes the Better Auth adapter does not create for itself.

#### `schema.ts`

Hand-written document types and the boundary mappers between BSON `Date` and the epoch-seconds
contract the rest of the app is written against. Contains no imports from `db/index.ts`.

---

### `lib/`

Small pieces of reusable application logic.

```text
lib/
├── action-errors.ts
├── actions.ts
├── daily-goal.ts
├── queries.ts
├── subjects.ts
├── timezone.ts
├── timer.ts
└── utils.ts
```

#### `actions.ts`

Server Actions that modify data.

Examples:

```text
createSession()
finishSession()
updateSession()
deleteSession()
```

Every action returns an `ActionResult` and means it: an `updateOne` / `deleteOne` that matched
nothing returns `SESSION_NOT_FOUND` instead of a success that changed nothing. Test
`matchedCount`, not `modifiedCount` — a save where the user changed nothing is a real, owned,
present session and also reports `modifiedCount: 0`.

#### `queries.ts`

Server-side database queries.

Examples:

```text
getActiveSession()
getSessions()
getDashboardSummary()
getDailyFocus()
getSubjectAnalytics()
getTopicAnalytics()
```

Analytics queries take an IANA `timeZone` (or a `RangeFilter`) so the range bounds and the bucket
keys are derived from one call — see `lib/timezone.ts`.

Range *shape* lives in `lib/analytics-range.ts`, which is deliberately free of both the database and
the session: `resolveAnalyticsRange` turns a range into bounds and an axis, `foldDaysIntoBars` turns
sparse days into dense bars, and both are testable against fixed dates with no fixture and no user.

Subject reads fold case and whitespace server-side with the same aggregation expression, so the
subject list, the analytics breakdown, and the subject filter cannot disagree — see
`lib/subjects.ts`.

#### `subjects.ts`

What counts as the same subject. `normalizeSubject()` for writes, `subjectKey()` / `isSameSubject()`
for comparisons. Deliberately import-free (no Mongo, no Next) because client components and server
queries both need it, and deliberately does not change casing: `DSA` is not "Dsa".

#### `daily-goal.ts`

The `localStorage`-backed daily focus goal, shared by the settings form and the dashboard progress
bar through `useDailyGoalHours()`. Read in an effect, never during render — `localStorage` does not
exist during SSR. One owner for the key, so the form and the bar cannot drift apart.

#### `action-errors.ts`

Turns an action's error code into something worth showing a person. Zod validation messages are not
in the table; an unknown string is a human message and is passed through.

#### `timezone.ts`

Calendar-day and week boundaries in a named IANA zone, using `Intl` only.

```text
getDayRange()   // the user's "today", DST-correct
getWeekRange()  // Sun-Sat, plus the seven bucket keys
formatDateInZone()
dateToStringOptions()
```

The server cannot know the user's zone, so `components/timezone-sync.tsx` publishes the browser's
zone to a cookie and `lib/session.ts#getUserTimeZone` reads it back. Keep this module free of
Next.js and Mongo imports so it also works in a route handler and in the verification script.

A first request arrives before the cookie exists, so the server answers it with its own fallback
zone. The two pages whose numbers are bucketed by zone (`/`, `/analytics`) pass that resolved zone
back to `TimezoneSync`, which calls `router.refresh()` once when it differs from the browser's. The
root-layout instance is left without the prop on purpose — reading the cookie there would make the
static sign-in and sign-up pages dynamic to service a component that does nothing for them.

#### `timer.ts`

The timing core. Pure functions, no React, no `window`, no network — every transition
takes `now` as an argument so the whole thing is testable without a browser.

Examples:

```text
startSegment()  pauseSegment()      // the two transitions
stopwatchElapsedMs()                // THE definition of elapsed
serializeStopwatch()  restoreStopwatch()  // survive a reload
parsePersistedStopwatch()           // validate localStorage
resolveStartedAt()                  // guard a wrong system clock
formatDuration()  formatTimerDisplay()
```

#### `timer-store.ts`

The running timer as a module singleton outside React, consumed with
`useSyncExternalStore`. Owns the clock, checkpoints it to `localStorage` on every
transition, and renders via `requestAnimationFrame` while publishing only when the
displayed second changes.

```text
seedFromServer()  reconcileFromServer()   // effects, never render
canSkipReconcile()                        // when the reconcile may be skipped
startFromServer()  pause()  resume()  clear()
readFinalTotals()  useTimerSnapshot()     // split client/server snapshots
```

#### `utils.ts`

Small generic utilities that don't belong elsewhere.

Do not turn this into a dumping ground.

---

### `scripts/`

One-off operational scripts, run with `tsx`.

```text
scripts/
├── _load-env.ts
├── backfill-paused-at.ts
├── create-indexes.ts
└── verify-e2e.ts
```

There is no migration directory, because there is no schema migration step — indexes are created
idempotently at runtime or via `npm run db:indexes`. A field added later (like `pausedAt`) gets a
one-off idempotent backfill script here instead, e.g. `npm run db:backfill-paused-at`.

Don't manually put application logic here.

---

### `public/`

Static assets.

Initially this may contain almost nothing.

---

# Dependency Direction

Keep the dependency flow simple:

```text
Pages
  ↓
Components
  ↓
Server Actions / Queries
  ↓
Database
  ↓
MongoDB
```

More specifically:

```text
app/
  ↓
components/
  ↓
lib/actions.ts
lib/queries.ts
  ↓
db/
  ↓
MongoDB
```

Components should not query the database directly.

---

# What We Are Deliberately NOT Creating

Do not create these folders until there is a real reason:

```text
❌ services/
❌ repositories/
❌ controllers/
❌ middleware/
❌ stores/
❌ contexts/
❌ types/
❌ constants/
❌ hooks/
```

If a file becomes large enough to justify extracting something, then extract it.

---

# Growth Rule

The project should evolve based on actual complexity.

For example, if `lib/actions.ts` eventually becomes huge:

```text
lib/
└── actions/
    ├── sessions.ts
    └── settings.ts
```

Don't create that structure before you need it.

The goal is:

> **Start simple. Refactor when complexity appears, not before.**