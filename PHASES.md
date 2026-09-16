# TickTock Implementation Phases

This document outlines the end-to-end execution roadmap to implement **TickTock** completely, in strict accordance with the specifications in [`docs/PRD.md`](./docs/PRD.md), [`docs/FOLDER_STRUCTURE.md`](./docs/FOLDER_STRUCTURE.md), [`docs/DB_SCHEMA.md`](./docs/DB_SCHEMA.md), and [`docs/API.md`](./docs/API.md).

---

## Architecture & Implementation Principles

- **App Name:** TickTock
- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript.
- **UI Components:** shadcn/ui component library configured in `components/ui/` with Tailwind CSS v4.
- **Design Aesthetic:** Minimal modern productivity instrument (Linear / Raycast vibe: clean typography, subtle borders, restrained palettes, dark mode support).
- **Persistence:** SQLite with Drizzle ORM. Single authoritative database layer.
- **Timer Mechanics:** Timestamp-anchored arithmetic (`duration = elapsed - paused`). Zero reliance on fragile tick counters (`seconds++`) and zero periodic database polling.
- **Resilience:** Full session recovery across page refreshes and browser restarts.

---

## Phase 1: Environment Setup, Dependencies & shadcn/ui Foundation

Establish the tooling, configure SQLite/Drizzle, initialize shadcn/ui, install required UI primitives, and set up base styling and layouts.

### 1.1 Dependencies & Config
- [x] Install required production dependencies:
  - `drizzle-orm`, `better-sqlite3`, `zod`, `lucide-react`, `clsx`, `tailwind-merge`, `date-fns`, `next-themes`.
- [x] Install dev dependencies:
  - `drizzle-kit`, `@types/better-sqlite3`.
- [x] Create `drizzle.config.ts` configuring SQLite dialect and migration folder at `drizzle/`.
- [x] Configure environment variables in `.env.local` (e.g. `DATABASE_URL=sqlite.db`).

### 1.2 shadcn/ui Setup & Core UI Primitives
- [x] Initialize shadcn/ui with Tailwind CSS (`components.json` configuration targeting `components/ui/` and `lib/utils.ts`).
- [x] Add shadcn/ui components:
  - `button`
  - `card`
  - `dialog`
  - `input`
  - `select`
  - `badge`
  - `progress`
  - `tooltip`
  - `dropdown-menu`
  - `textarea`
  - `tabs`
- [x] Establish global design tokens and CSS variables in `app/globals.css` (neutral base, subtle borders, dark/light theme).
- [x] Build shared TickTock App Shell / Navigation in `app/layout.tsx`:
  - Minimal sidebar or top navigation with brand "TickTock" linking to:
    - **Dashboard** (`/`)
    - **Sessions** (`/sessions`)
    - **Analytics** (`/analytics`)
    - **Settings** (`/settings`)
  - Active route indicators and dark mode theme provider.

**Acceptance Criteria:**
- shadcn/ui initialized and components installed in `components/ui/`.
- Project builds cleanly with `npm run build` and `npm run lint`.
- Layout renders navigation seamlessly across desktop and mobile screens.

---

## Phase 2: Database Schema, Connection & Migration Layer

Implement the SQLite persistence layer and Drizzle ORM schema matching [`docs/DB_SCHEMA.md`](./docs/DB_SCHEMA.md).

### 2.1 Schema Definition
- [x] Define the `sessions` table in `db/schema.ts`:
  - `id` (TEXT, Primary Key, UUID / nanoid)
  - `subject` (TEXT, Not Null)
  - `topic` (TEXT, Nullable)
  - `started_at` (INTEGER, Not Null, Unix timestamp in seconds)
  - `ended_at` (INTEGER, Nullable, Unix timestamp in seconds)
  - `duration_seconds` (INTEGER, Not Null, Default 0)
  - `paused_seconds` (INTEGER, Not Null, Default 0)
  - `status` (TEXT, Not Null, Default `'active'`: `'active' | 'paused' | 'completed'`)
  - `outcome` (TEXT, Nullable)
  - `goal` (TEXT, Nullable)
  - `notes` (TEXT, Nullable)
  - `created_at` (INTEGER, Not Null, Unix timestamp)
  - `updated_at` (INTEGER, Not Null, Unix timestamp)
  - Indexes on `started_at`, `status`, and `subject`.

### 2.2 Connection & Migrations
- [x] Implement database client singleton in `db/index.ts` ensuring resilient local connection in both dev and production.
- [x] Run migration generator (`drizzle-kit generate`) to create `drizzle/0000_huge_quasar.sql`.
- [x] Implement automated migration runner / sync for initial schema initialization.
- [x] Add lightweight seed script / dev fixtures to test queries if needed (`scripts/seed.ts`).

**Acceptance Criteria:**
- Database tables and indexes are generated and queryable in SQLite.
- Database connection survives hot reloads during development.

---

## Phase 3: Core Business Logic, Calculations & Server Actions

Implement backend server functions, Zod validation schemas, and timestamp arithmetic in `lib/` as specified in [`docs/API.md`](./docs/API.md).

### 3.1 Timer Utilities (`lib/timer.ts`)
- [x] `calculateDuration(startedAt, endedAt, pausedSeconds)`: Accurate timestamp difference minus paused intervals.
- [x] `calculateCurrentElapsed(startedAt, pausedSeconds, isPaused, lastPausedAt)`: For client-side rendering.
- [x] `formatDuration(seconds)`: Converts seconds into human-readable strings (`"4h 32m"`, `"52m"`, `"01:42:36"`).
- [x] `formatTime(timestamp)`: Formats Unix timestamps to local display times.

### 3.2 Server Queries (`lib/queries.ts`)
- [x] `getActiveSession()`: Fetches any session where `status IN ('active', 'paused')`.
- [x] `getSessions(options)`: Fetches paginated/filtered sessions (by date range, subject, keyword), ordered newest first.
- [x] `getSessionById(id)`: Fetches full details for a single session.
- [x] `getDashboardSummary(targetDate)`: Aggregates total focused seconds, session count, distinct subjects, longest session, recent sessions, and active session.
- [x] `getDailyAnalytics(range)`: Groups completed duration by day for charts.
- [x] `getSubjectAnalytics(range)`: Groups total focus duration by subject.
- [x] `getTopicAnalytics(range)`: Groups focus duration by topic under each subject.

### 3.3 Server Actions & Validation (`lib/actions.ts`)
- [x] Define Zod schemas: `createSessionSchema`, `finishSessionSchema`, `updateSessionSchema`.
- [x] `createSession(data)`:
  - Enforce concurrency invariant: verify no active/paused session exists before creating.
  - Return `{ success: true, data }` or `{ success: false, error: 'ACTIVE_SESSION_EXISTS' }`.
- [x] `pauseSession(id)`:
  - Validates current state is `active`, switches status to `paused`, records pause timestamp.
- [x] `resumeSession(id)`:
  - Validates current state is `paused`, increments `paused_seconds` by the paused delta, sets status to `active`.
- [x] `finishSession(id, data)`:
  - Calculates final `duration_seconds`, assigns `ended_at`, stores `outcome` and `notes`, sets status to `completed`.
- [x] `updateSession(id, data)`:
  - Updates subject, topic, goal, outcome, notes, or corrected duration.
- [x] `deleteSession(id)`:
  - Removes a session with safety checks.

**Acceptance Criteria:**
- Unit/integration checks verify timer calculations and edge cases (e.g. multi-hour pauses, invalid state transitions).
- Concurrency restriction prevents starting duplicate active sessions.

---

## Phase 4: Active Timer Engine & Live Dashboard

Build the primary user screen (`app/page.tsx`) and the active timer system with shadcn/ui components.

### 4.1 Timer Engine & Client State (`components/timer.tsx`)
- [x] Implement client-side timer hook:
  - Subscribes to active session props.
  - Runs local interval deriving live elapsed time from timestamps.
  - Handles `idle`, `running`, `paused`, and `completed` states.
  - Subtle visual pulse while active; calm, clear typography.
- [x] Action buttons using shadcn `Button`: `Start session`, `Pause`, `Resume`, `Finish`.

### 4.2 Start & Finish Session Dialogs
- [x] `components/start-session.tsx`:
  - Quick-start modal using shadcn `Dialog`.
  - Subject input with auto-suggestions from previous subjects.
  - Optional topic and goal inputs.
- [x] `components/session-form.tsx` (Finish Dialog):
  - Fast outcome selector (`Learned`, `Revised`, `Solved problems`, `Built something`, `Practiced`, `Nothing specific`).
  - Optional free-form notes using shadcn `Textarea`.
  - Celebratory micro-feedback on save.

### 4.3 Active Session Recovery
- [x] Ensure that refreshing the page or navigating away and back immediately restores the running/paused timer without data loss.

### 4.4 Dashboard Overview Widgets
- [x] `components/dashboard-summary.tsx`:
  - "Today" metrics via shadcn `Card`: focused time, sessions completed, subjects studied, longest session.
  - Daily progress bar using shadcn `Progress` (e.g. `4h 32m / 4h goal`) with positive, non-punitive messaging.
  - Recent sessions quick-list with durations and click-to-view details.

**Acceptance Criteria:**
- User can start a session in <3 clicks.
- Pausing, resuming, and finishing update database and UI instantaneously.
- Hard-refreshing the browser retains exact elapsed time without reset or drift.

---

## Phase 5: Sessions History & Session Management

Implement the full session log (`app/sessions/page.tsx`) with search, filtering, editing, and deletion using shadcn/ui components.

### 5.1 Session History List (`components/session-list.tsx`)
- [x] Group sessions by natural date buckets (`Today`, `Yesterday`, `This Week`, previous dates).
- [x] Display subject, topic, duration via shadcn `Badge`, start time, and outcome pills.
- [x] Filters: shadcn `Select` for subject, date range filter, and search `Input`.

### 5.2 Session Details, Edit & Delete Modal
- [x] Detail view dialog using shadcn `Dialog`: Subject, Topic, Goal, Focused Duration, Paused Time, Outcome, Notes, Timestamps.
- [x] Edit action allowing the user to modify notes, outcome, subject/topic, or adjust duration.
- [x] Delete action with explicit confirmation dialog to avoid accidental loss.

**Acceptance Criteria:**
- Historical sessions display chronologically with reactive filtering.
- Editing updates the session immediately and refreshes aggregate calculations.
- Deletion removes the session and updates UI lists gracefully.

---

## Phase 6: Analytics & Insights Dashboard

Build the dedicated analytics screen (`app/analytics/page.tsx`) focused on actionable study habits rather than vanity metrics.

### 6.1 Weekly & Daily Aggregates
- [x] Metric cards using shadcn `Card`: Total focused time this week, sessions completed, average session length, longest study day.
- [x] Daily activity bar chart (visualizing focused time across Monday – Sunday).

### 6.2 Distribution & Subject Breakdown
- [x] Time by subject breakdown (shadcn `Progress` bars / proportional horizontal bars with total hours and percentages).
- [x] Time by topic list for top subjects (conditionally shown when topic data exists).
- [x] Focused vs. Paused ratio metric.

### 6.3 Thoughtful Empty States
- [x] Clean, motivating empty states when no analytics data exists yet ("Nothing tracked yet. Ready when you are.").

**Acceptance Criteria:**
- Analytics accurately reflect SQLite session records across weekly/daily ranges.
- Zero clutter: strictly useful study metrics without fake gamification or arbitrary scores.

---

## Phase 7: Settings, Preferences & Data Portability

Build the configuration and data ownership page (`app/settings/page.tsx`).

### 7.1 General Settings
- [x] Daily focus goal setting (default 4 hours, configurable in hours/minutes).
- [x] Theme selection (System, Light, Dark).
- [x] Sound / micro-animation toggle options.

### 7.2 Data Export & Privacy
- [x] JSON Export: Full export of all sessions with metadata via `/api/export?format=json`.
- [x] CSV Export: Formatted spreadsheet export (`date,subject,topic,duration_seconds,duration_formatted,outcome,notes`) via `/api/export?format=csv`.
- [x] Clear / Reset data feature with multi-step destructive confirmation.

**Acceptance Criteria:**
- Exported JSON and CSV files download instantly and contain all stored sessions.
- Goal adjustments reflect immediately on the Dashboard progress bar.

---

## Phase 8: UX Polish, Keyboard Shortcuts, Dark Mode & Verification

Refine the application into a frictionless, calm desktop/mobile instrument.

### 8.1 Keyboard Shortcuts
- [x] Global shortcut handler:
  - `Space`: Pause / Resume active timer (disabled when focusing inputs).
  - `S`: Open start session modal.
  - `F`: Finish active session.
  - `Esc`: Close modals/dialogs.
  - `?`: Shortcut cheat sheet overlay via shadcn `Dialog`.

### 8.2 Design & Microcopy Refinements
- [x] Subtle hover interactions, smooth transitions, calm typography, and cohesive spacing.
- [x] Playful, quiet microcopy matching PRD examples (encouraging completion states, non-punitive goal reminders).

### 8.3 Quality Assurance & Verification
- [x] Comprehensive verification of all Definition of Done items:
  - End-to-end user flow: Start -> Pause -> Resume -> Finish -> Review -> Analyze.
  - Browser refresh recovery during active and paused sessions.
  - Mobile responsiveness across phone and tablet viewports.
  - Type checking (`tsc --noEmit`), linting (`npm run lint`), and production build (`npm run build`).

---

## Phase Progress Tracker

| Phase | Description | Status |
|---|---|---|
| **Phase 1** | Environment Setup, Dependencies & shadcn/ui Foundation | Completed |
| **Phase 2** | Database Schema, Connection & Migration Layer | Completed |
| **Phase 3** | Core Business Logic, Calculations & Server Actions | Completed |
| **Phase 4** | Active Timer Engine & Live Dashboard | Completed |
| **Phase 5** | Sessions History & Session Management | Completed |
| **Phase 6** | Analytics & Insights Dashboard | Completed |
| **Phase 7** | Settings, Preferences & Data Portability | Completed |
| **Phase 8** | UX Polish, Keyboard Shortcuts & Final Verification | Completed |
