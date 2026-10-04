# TickTock — Implemented Features

This document lists only what is **actually built and working** in the codebase today. It is
verified against the source, not against the PRD. Anything described in `docs/PRD.md` as planned,
V2, or explicitly a non-goal is not here.

TickTock is a focused time tracker for coding, study, and creative work. It runs entirely on your
own clock: the timer runs in the browser and makes exactly two requests per session (one to open
it, one to close it).

---

## 1. Authentication & Account

- **Sign up** with a username + password (`/` signup flow, `/signup`).
  - Username rules: 3–30 characters, letters/numbers/dots/dashes/underscores, lowercased.
  - Password minimum 8 characters, with confirm-password field.
- **Sign in** with username + password (`/login`).
- **Sign out** from the Settings account card.
- **Change username** from Settings.
- **Change password** (requires current password) from Settings.
- Session-cookie protection on all app routes via `proxy.ts` (Next.js Proxy). Unauthenticated
  visitors are redirected to `/login`.
- Passwords are hashed by Better Auth; no credentials are stored by this app.
- Username login normalises case so `Rakesh` and `rakesh` resolve to the same account.

Built with **Better Auth** (username plugin) on top of MongoDB.

---

## 2. Session Timer (the core)

- **Start a session** from the dashboard: subject (required), topic (optional), goal (optional).
- **Pause** — stops the clock; the paused interval is not counted as focused time.
- **Resume** — continues from the banked total.
- **Finish** — snapshots the totals, opens the completion dialog.
- **Timestamp-anchored timing** — elapsed time is derived from real instants, never counted by
  incrementing a counter. Sampling rate cannot change the answer.
- **Two clocks, chosen deliberately** — `performance.now()` for the live run segment (monotonic,
  immune to system-clock changes), `Date.now()` only when checkpointing a segment (survives
  reload).
- **Two requests per session, ever** — `createSession` on start, `finishSession` on finish.
  Pause/resume are pure local transitions and hit no network.
- **Session survives a reload** — the timer state is checkpointed to `localStorage` on every
  transition and restored, folding in time elapsed while the tab was closed.
- **Session survives navigation** — the timer store lives outside React, so route changes don't
  reset it.
- **Full-screen focus mode** — one-key immersive timer with its own controls.
- **One active session at a time** — enforced in application code *and* by a unique partial index
  in the database.
- **Clock-skew guard** — a client-supplied start time that is wildly off falls back to the
  server's clock.

---

## 3. Session Completion

- Finish opens a completion dialog showing the exact focused total.
- **Quick outcome picker**: Learned, Revised, Solved problems, Built something, Practiced, Nothing
  specific (all optional).
- **Optional notes** textarea.
- **Celebration** on save with a "Woohoo!" moment and the recorded duration.
- A failed save keeps the form open with the error, so nothing is lost.
- Duration is clamped server-side to the wall-clock span so a wrong system clock cannot corrupt the
  record.

---

## 4. Dashboard (`/`)

- **Live timer card** — idle "Ready to focus?" hero, or the running/paused clock with per-digit
  animation, subject, topic, goal, and Pause/Resume/Finish controls.
- **Today's Goal** progress bar — `focused / goal`, with non-punitive messaging.
- **Today's metrics** — Focused time, Sessions, Subjects, Longest session.
- **Recent Sessions** list — click any row to open full details; "View all" link to `/sessions`.
- Everything is computed for the **user's** calendar day (their timezone), not the server's.

---

## 5. Sessions History (`/sessions`)

- Full list of **completed** sessions, grouped by natural date (Today, Yesterday, weekday, date).
- **Search** across subject, topic, goal, outcome, and notes.
- **Filter by subject** (dropdown) and **by date range** (All time / Today / This week).
- Each row shows subject (color-coded), topic, start time, outcome, notes preview, and duration.
- Click a row to open the **session detail modal**.
- Shows the 250 most recent sessions, with an honest notice when history is truncated.

---

## 6. Session Detail, Edit & Delete

- Detail modal shows subject, topic, focused duration, **paused time**, start/end timestamps, goal,
  outcome, and notes.
- **Edit** any completed session (subject, topic, goal, outcome, notes). Tracked duration is locked
  and clearly labelled as such.
- **Delete** with an explicit confirmation step.
- Edit and delete surface server errors in-place instead of silently closing.

---

## 7. Analytics (`/analytics`)

A **range selector** (Week · Month · Year · All time) scopes the four headline metrics, the bar
chart, and the subject/topic panels. Selection rides on `?range=`, so a view is linkable and the
browser back button steps through ranges. The default week renders at the bare `/analytics` URL.

The heatmap below is the one exception: it always covers the **trailing 52 weeks** and carries its
own header saying so, because reusing the selected range there would make two different datasets
read as one.

- **Four headline metrics** — range total, Sessions, Average session, Longest day.
  - "Longest day" is a weekday in the week view (the seven bars beneath it are already labelled with
    those) and a date in wider ranges, where "Wed" three months apart is three different days.
- **Activity bar chart** — one bar per bucket, with hover tooltips (duration).
  - **Week** → 7 daily bars, Sunday first, Sun–Sat.
  - **Month** → 4–6 *Sunday-aligned week columns*, labelled by the first day of each column inside
    the month. Weeks are never cut on the 1st: unequal slices make the chart incomparable.
  - **Year** → 12 monthly bars, Jan–Dec.
  - **All time** → one bar per month of history, gap-filled with real zero bars. The axis runs from
    the user's first session to the current month.
  - Bar gaps and corner radii step down with the bar count, so 60 bars stay bars rather than
    slivers.
  - Axis labels thin to fit what is actually on screen, measured after render — twelve `Nov '25`
    labels fit a laptop and wrap on a phone.
  - Empty buckets render as visible zero-height bars rather than being omitted, so an empty month
    cannot shift the months after it left and read as a busy one.
- **Focus Heatmap** — a calendar grid of focus time per day, one column per week, covering the
  **trailing 52 weeks** in the user's timezone.
  - Bucketed server-side into the user's own zone, so a session filed at Monday 20:00 UTC lands
    on Monday in New York and Tuesday in Kolkata — the same rule the range chart uses.
  - **Fixed hour thresholds**, not quantiles of your own history: `none`, `<1h`, `1–2h`, `2–4h`,
    `4h+`. A single 14-hour day therefore cannot flatten an ordinary 3-hour day into the bottom
    bucket, and a 3-hour day means the same thing this month as last year.
  - Days after today render invisible rather than as an empty cell, so an ordinary Wednesday
    never reads as a day you failed.
  - Month labels, Sun/Tue/Thu row labels, per-cell hover tooltips (duration + session count),
    and a labelled intensity legend.
  - Horizontally scrollable on narrow screens, opening scrolled to the **most recent** week.
  - Descriptive only — no streak counter, no score, no rank, and no comparison against other
    users.
- **Time by Subject** — proportional progress bars with duration and percentage, capped at 8 rows
  with a "+N more" tail rather than an unbounded list.
- **Time by Topic** — the top topics with their subject and total duration.
- Thoughtful empty states that name the range ("Nothing tracked yet", "Nothing tracked this week
  yet").

---

## 8. Settings (`/settings`)

- **Account card** — change username, change password, sign out.
- **General**:
  - **Daily focus goal** (0.5–24 hours, default 4). Stored per-device in `localStorage` and shared
    with the dashboard progress bar, so the two can't drift.
  - **Theme** — Light / Dark / System.
- **Data Export** — download all your sessions:
  - **JSON** (`/api/export?format=json`)
  - **CSV** (`/api/export?format=csv`, columns: date, started_at, ended_at, subject, topic,
    duration_seconds, duration_formatted, paused_seconds, status, outcome, goal, notes)
- **Danger Zone** — **Clear all data** behind a typed "delete all" confirmation.

---

## 9. Keyboard Shortcuts

Defined once in `lib/shortcuts.ts` and used by both the timer and the navbar help dialog.

| Key | Action |
| --- | --- |
| `S` | Start session |
| `Space` | Pause / Resume timer |
| `F` | Finish session |
| `M` | Toggle full-screen focus mode |
| `T` | Toggle light / dark theme |
| `?` | Show the shortcuts dialog |
| `Esc` | Exit full screen / close modal |

Shortcuts are suppressed while typing in an input, textarea, select, or open listbox.

---

## 10. UX & Design

- **Dark mode** with system-aware default and a manual toggle.
- **Responsive** — desktop sidebar nav; mobile bottom navigation bar; layouts adapt across phone,
  tablet, and desktop.
- **PWA-ready** — web app manifest, maskable icons, standalone display, themed title.
- **Playful, subtle microcopy** — completion celebrations, encouraging goal messages, warm empty
  states.
- **Animated timer digits** — each digit rolls independently (seconds roll every second; minutes
  sit still), in a fixed-width monospaced grid.
- **Per-subject colour themes** — a stable colour is derived from each subject and used
  consistently for its pills, dots, and bars.
- **Accessible** — labelled controls, labelled toggle groups, `aria-pressed` selection state,
  screen-reader-friendly timer (no noisy live region), keyboard hints hidden on mobile.

---

## 11. Data Layer

- **MongoDB** via the official driver (no ORM). One app-owned collection, `studySessions`, plus
  four Better Auth collections.
- **Timestamps** stored as BSON `Date`; the app works in epoch **seconds** and converts at the
  boundary.
- **Index bootstrap** — `npm run db:indexes` creates indexes idempotently, including a unique
  partial index that enforces the one-active-session rule.
- **Server Actions** for all writes (`createSession`, `finishSession`, `updateSession`,
  `deleteSession`, `clearAllSessions`).
- **Server queries** for all reads (active session, history, subjects, dashboard summary, sparse
  daily focus, subject / topic analytics).
- **Zod validation** on every client input, with friendly error messages.
- **Subject identity** — stored trimmed/collapsed but compared case-insensitively so `Python` and
  `python` merge into one subject, list entry, colour, and analytics row.

---

## 12. Reliability & Verification

- **Query/timing verification script** — `npm run test:e2e -- --user <username>` runs ~150 assertions
  against a real account covering the concurrency rule, duration math, timezone bucketing, search
  escaping, the four analytics ranges (bounds, Sunday alignment, gap-filling, axis captions, a
  DST-month boundary), the heatmap's range/grid/scale, and the pause/reload state machine.
- **Streaming UI** — each page's data region sits behind its own `Suspense` boundary with skeleton
  fallbacks, so the shell paints immediately.
- **Type checking and linting** — `npx tsc --noEmit`, `npm run lint`.
- **Production build** — `npm run build`.

---

## 13. Not Implemented (explicitly out of scope today)

The PRD lists these as non-goals or V2 ideas; none are built:

- Social features, leaderboards, sharing, public profiles
- AI coach, study plans, productivity scoring, streaks/XP/badges
- Calendar sync, browser activity monitoring, automatic coding detection
- Pomodoro mode, timer presets, session templates
- Calendar **view** (month/agenda), PWA offline sync
- Mobile native apps, browser notifications
- Billing, multi-tenancy, team collaboration
- Data **import** (export exists; import does not)

See `docs/PRD.md` §39–§40 and `docs/ISSUES.md` for the full backlog and open issues.
