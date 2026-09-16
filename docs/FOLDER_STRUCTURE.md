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
├── drizzle/
│
├── public/
│
├── .env.local
├── drizzle.config.ts
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
└── dashboard-summary.tsx
```

Keep components focused on UI and interaction.

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

Everything directly related to SQLite and Drizzle.

```text
db/
├── index.ts
└── schema.ts
```

#### `index.ts`

Creates the SQLite database connection and Drizzle instance.

#### `schema.ts`

Defines the database tables.

---

### `lib/`

Small pieces of reusable application logic.

```text
lib/
├── actions.ts
├── queries.ts
├── timer.ts
└── utils.ts
```

#### `actions.ts`

Server Actions that modify data.

Examples:

```text
createSession()
pauseSession()
resumeSession()
finishSession()
updateSession()
deleteSession()
```

#### `queries.ts`

Server-side database queries.

Examples:

```text
getActiveSession()
getSessions()
getDashboardSummary()
getDailyAnalytics()
getSubjectAnalytics()
getTopicAnalytics()
```

#### `timer.ts`

Timer-related calculations.

Examples:

```text
calculateDuration()
calculatePausedTime()
formatDuration()
```

#### `utils.ts`

Small generic utilities that don't belong elsewhere.

Do not turn this into a dumping ground.

---

### `drizzle/`

Generated migration files.

Example:

```text
drizzle/
├── 0000_initial.sql
└── meta/
```

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
SQLite
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
SQLite
```

Components should not directly manipulate SQLite.

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