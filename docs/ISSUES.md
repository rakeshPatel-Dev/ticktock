# TickTock — Known Issues

> Last updated: 2026-09-27. Issues #1–#8 and #11 are fixed; #9, #10, #12–#20 are open.

This document catalogues bugs, design weaknesses, and missing features discovered during a code review of the TickTock codebase. Issues are grouped by severity.

---

## ✅ Critical / Data-integrity — all three fixed

### 1. ~~`resumeSession` pause-delta is computed from `updatedAt`~~ — FIXED

**Was:** [`lib/actions.ts`](file:///home/patel/Projects/ticktock/lib/actions.ts#L176)

`updatedAt` was used as a proxy for "the moment the session was paused." Any other mutation — editing
the subject or notes while the session was paused — silently reset the pause-start anchor and
under-reported `pausedSeconds`.

**Now:** a dedicated `pausedAt: number | null` (epoch seconds) exists on `StudySession` /
`StudySessionDoc`, written only by `pauseSession` (set) and `resumeSession` / `finishSession`
(cleared). `updatedAt` is back to meaning "row last modified" and is never a duration input. The one
sanctioned reader is `db/schema.ts#pauseAnchorSeconds`, which the server actions and the client timer
(`computeCurrentElapsed`) both call, so they cannot drift apart.

- `db/schema.ts` — field, mappers, `toUpdateDoc`, `pauseAnchorSeconds`
- `lib/actions.ts` — `pauseSession` / `resumeSession` / `finishSession` / `createSession`
- `components/timer.tsx:40` — paused display reads the anchor, not `updatedAt`
- `scripts/backfill-paused-at.ts` + `npm run db:backfill-paused-at` — pins `pausedAt` on documents
  written before the field existed (idempotent), so the `?? updatedAt` legacy shim in
  `pauseAnchorSeconds` is no longer load-bearing
- `scripts/verify-e2e.ts` — asserts the anchor survives a mid-pause edit, a completed row has no
  anchor, and a legacy document still resolves one

---

### 2. ~~Analytics uses all-time data while the dashboard uses today-only data~~ — FIXED

**Was:** [`lib/queries.ts`](file:///home/patel/Projects/ticktock/lib/queries.ts#L287), [`app/analytics/page.tsx`](file:///home/patel/Projects/ticktock/app/analytics/page.tsx)

`getSubjectAnalytics` and `getTopicAnalytics` aggregated a user's entire history while the bar chart
above them was scoped to the current week, so the "This Week" cards never matched the panels below.

**Now:** both take an optional `RangeFilter` (`{ from, to }` in epoch seconds) and
`app/analytics/page.tsx` passes the **chart's own week** from `getWeekRange`, so the cards, the bars,
and the two panels are three views of one dataset. Called without a range they are still all-time,
which is the correct reading for a "whole history" panel — the bug was the caller, not the query.

Also fixed here: the panel sort had no tie-breaker, so subjects with equal totals could swap places
between page loads. `subject` (and `topic`) is now the secondary key.

`scripts/verify-e2e.ts` asserts that a session outside the week is present in the all-time query and
absent from the week-scoped one, and that the subject panel's duration total equals the chart's.

---

### 3. ~~UTC-vs-local timezone mismatch in the weekly analytics buckets~~ — FIXED

**Was:** [`lib/queries.ts`](file:///home/patel/Projects/ticktock/lib/queries.ts#L225)

`$dateToString` without a `timezone` option formats in UTC while the Monday/Sunday bounds were
computed in local time. A session at 11 PM local in a UTC+ zone was keyed as the next day — a key
outside the range, so its minutes were dropped rather than shown on the wrong bar.

**Now:** `lib/timezone.ts` is the single place calendar boundaries are computed.

- The user's IANA zone is published by `components/timezone-sync.tsx` (rendered in the root layout)
  to the `ticktock_tz` cookie, and read back by `lib/session.ts#getUserTimeZone` with validation —
  a cookie is user-writable and an unvalidated value would throw inside `$dateToString`.
- `getDailyAnalytics` passes `timezone` to `$dateToString` via `dateToStringOptions(tz)`, and builds
  its seven bucket keys from the same `getWeekRange(reference, tz)` that produced the range bounds.
- `getDashboardSummary` uses `getDayRange` for "today", so the dashboard's day boundary is the user's
  midnight rather than the server's.
- `getDayRange` ends a day at the start of the next day, so DST days are 23/25 hours rather than a
  flat 24. `verify-e2e.ts` asserts the 23-hour case, and that the same instant files on Monday in
  New York but on Tuesday in Kolkata.

Known, accepted limitation: with no cookie yet — the first request of a visit on a UTC host — the
fallback is the server's zone. It self-corrects from the second navigation on and is not persisted,
so it cannot accumulate.

---

## 🟠 High — UX / correctness — all five fixed

### 4. ~~Daily goal is stored in `localStorage` but never read back on the dashboard~~ — FIXED

**Files:** [`lib/daily-goal.ts`](file:///home/patel/Projects/ticktock/lib/daily-goal.ts), [`components/dashboard-summary.tsx`](file:///home/patel/Projects/ticktock/components/dashboard-summary.tsx), [`components/settings-view.tsx`](file:///home/patel/Projects/ticktock/components/settings-view.tsx)

The settings page saved the goal to `localStorage` under `ticktock_daily_goal_hours` and
`DashboardPage` never read it, so the dashboard always showed the 4-hour default.

`lib/daily-goal.ts` now owns the key, the bounds, the read, the write, and a
`useDailyGoalHours` hook. Both pages go through it, so the form and the progress bar cannot
drift apart again. The read happens in an effect, never during render — `localStorage` does not
exist during SSR, and reading it mid-render guarantees a hydration mismatch, so the first paint
shows the default and the stored value lands a frame later. A `storage` listener keeps two open
tabs in step, and the settings form now reports a rejected value instead of silently ignoring it.

### 5. ~~Optimistic pause/resume state is never rolled back on server error~~ — FIXED

**File:** [`components/timer.tsx`](file:///home/patel/Projects/ticktock/components/timer.tsx)

`handlePause` / `handleResume` flip `session.status` immediately and discarded the `ActionResult`,
so a failed call left the UI claiming "Paused" while the row in Mongo still said `active` — the
duration then kept accruing somewhere the user could not see it.

Both handlers keep the previous session, and on failure restore it and surface
`describeActionError(...)` in a banner. The banner renders in the normal view *and* in the
fullscreen view, because those are separate branches of the tree and an error that only exists in
the layout you left is one you never see. It auto-dismisses after 6s.

### 6. ~~`FinishSessionModal` does not handle the `finishSession` failure case~~ — FIXED

**File:** [`components/session-form.tsx`](file:///home/patel/Projects/ticktock/components/session-form.tsx)

A failed save stopped the spinner and left the modal open with no feedback, so there was no way
to tell whether the session had been saved. The failure branch now renders the error and returns
early — before the celebration — and the outcome/notes stay in the form so a retry is one click
rather than retyping.

### 7. ~~`updateSession` does not verify the session belongs to the user before updating~~ — FIXED

**File:** [`lib/actions.ts`](file:///home/patel/Projects/ticktock/lib/actions.ts), [`components/session-detail-modal.tsx`](file:///home/patel/Projects/ticktock/components/session-detail-modal.tsx)

The filter always included `userId`, so the database was never at risk of a cross-user write —
but an unmatched update returned `{ success: true }`, and the modal closed either way, so a
rejected save looked identical to a successful one.

`updateSession` now returns `SESSION_NOT_FOUND` when nothing matched, and `deleteSession` does the
same via `deletedCount` for the same reason. The detail modal checks both results and stays open
with an error instead of closing.

**Deviation from the original suggestion, on purpose:** the issue proposed testing
`modifiedCount === 0`. That is the wrong signal. A save where the user changed nothing is a real,
owned, present session, and it reports `modifiedCount: 0` — so testing it would report "not
found" for the most ordinary edit in the app. `matchedCount === 0` is what actually means "no such
row for this user". Both are asserted in `scripts/verify-e2e.ts` so the distinction stays visible.

### 8. ~~Subject normalisation is inconsistent: case is preserved in storage but used as a filter key~~ — FIXED

**Files:** [`lib/subjects.ts`](file:///home/patel/Projects/ticktock/lib/subjects.ts), [`lib/queries.ts`](file:///home/patel/Projects/ticktock/lib/queries.ts), [`lib/actions.ts`](file:///home/patel/Projects/ticktock/lib/actions.ts), [`lib/colors.ts`](file:///home/patel/Projects/ticktock/lib/colors.ts), [`components/session-list.tsx`](file:///home/patel/Projects/ticktock/components/session-list.tsx)

`"Python"` and `"python"` were stored as two subjects, listed as two dropdown entries, drawn as
two analytics rows, and given two different colours — and the exact-match subject filter then
returned *neither* when the spelling drifted.

One identity function now decides, in two halves:

- **Stored** (writes): trimmed with internal whitespace collapsed, so a pasted double space or a
  trailing newline cannot fork a subject. Casing is NOT rewritten — title-casing turns `DSA` and
  `OB & HRM` into "Dsa" and "Ob & Hrm".
- **Compared** (reads): case- and whitespace-insensitive, folded *server-side* by the same
  aggregation expression the analytics group by. Folding at read time rather than on write is
  deliberate: it merges the duplicates that already exist, so this needs no migration.

That fold is used by `getAllSubjects`, `getSubjectAnalytics`, `getTopicAnalytics`, and the
`getSessions` subject filter, so the list, the breakdown, and the filter cannot disagree again. The
subject colour hashes the same key, and the client-side filter in `session-list.tsx` compares
through `isSameSubject` instead of `===`. The displayed spelling is the most recent one the user
typed.

**Collation was not used on `user_subject_idx`.** A case-insensitive index collation would only
have made the exact-match filter work; it would not have merged the two existing analytics rows or
deduped the dropdown, which is where the duplicates were actually visible.

---

## 🟡 Medium — missing features / edge cases

### 9. No `robots.txt` or `sitemap.xml` and the app has no authentication redirect for crawlers

**File:** [`next.config.ts`](file:///home/patel/Projects/ticktock/next.config.ts)

The Next.js config is empty. The app has no `robots.txt`, no `sitemap.xml`, and no
[`generateRobotsTxt`](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots)
file in `app/`. Search engines will happily crawl the login page and 404 pages.

**Suggested fix:** Add `app/robots.txt` (or a `robots.ts` metadata route) to disallow indexing
of authenticated routes.

---

### 10. Export route exports **all** sessions including active/paused ones

**File:** [`app/api/export/route.ts#L49-L51`](file:///home/patel/Projects/ticktock/app/api/export/route.ts#L49)

The export endpoint fetches sessions with `find({ userId })` — no `status` filter — so active
and paused sessions (with `durationSeconds: 0` and no `endedAt`) are included in the export.

**Impact:** Exported CSV/JSON contains in-progress sessions that look like zero-duration
completed sessions.

**Suggested fix:** Filter to `status: "completed"` or clearly mark non-completed sessions in
the export with a status column (CSV already includes `status`, but JSON consumers may be
confused by `endedAt: null`).

---

### 11. ~~The `getSubjectAnalytics` sort order is not guaranteed to be stable~~ — FIXED

**Was:** [`lib/queries.ts`](file:///home/patel/Projects/ticktock/lib/queries.ts#L314)

Sorted by `durationSeconds` descending with no tie-breaker, so subjects with identical totals could
change places between page loads. Fixed together with issue 2: `subject` is now the secondary key on
`getSubjectAnalytics` and `getTopicAnalytics` (which had the same gap), and `verify-e2e.ts` asserts
both the alphabetical order and that two consecutive reads agree.

---

### 12. `getAllSubjects` returns subjects from **all** statuses, not just `completed` sessions

**File:** [`lib/queries.ts#L130-L140`](file:///home/patel/Projects/ticktock/lib/queries.ts#L130)

An active subject that was accidentally started and never finished will persist in the
subject suggestion list indefinitely.

**Suggested fix:** Add `{ status: "completed" }` to the `$match` stage, or return subjects
from the active session separately.

---

### 13. `clearAllSessions` does not guard against an active session being deleted mid-timer

**File:** [`lib/actions.ts#L324-L339`](file:///home/patel/Projects/ticktock/lib/actions.ts#L324)

`clearAllSessions` deletes every document including active/paused sessions. The timer component
on the dashboard does **not** receive a server-push notification; the in-progress timer will
keep counting until the user refreshes, and on the next revalidation it will try to act on a
session ID that no longer exists.

**Suggested fix:** Either prevent `clearAllSessions` while a session is active (return
`ACTIVE_SESSION_EXISTS`), or force-complete any active session before deleting.

---

### 14. No `"week"` filter date range check for the current partial week in Sessions page

**File:** [`components/session-list.tsx#L56-L60`](file:///home/patel/Projects/ticktock/components/session-list.tsx#L56)

The "This week" filter checks `sessionDate < oneWeekAgo` (a rolling 7-day window), but the
analytics page defines "this week" as Mon–Sun. The two date ranges are inconsistent, creating
a confusing discrepancy between the Sessions list and the Analytics weekly chart.

**Suggested fix:** Use a calendar Mon–Sun boundary in `SessionListView` to match
`getDailyAnalytics`.

---

### 15. `shortcutHintClass` / `shortcutKbdClass` have no mobile fallback

**File:** [`lib/shortcuts.ts`](file:///home/patel/Projects/ticktock/lib/shortcuts.ts), [`components/timer.tsx#L218-L366`](file:///home/patel/Projects/ticktock/components/timer.tsx#L218)

Keyboard shortcut hints are shown on mobile (no `hidden` class), but there is no keyboard on
most mobile devices. The hint text is dead space on phones.

**Suggested fix:** Wrap shortcut hint paragraphs in `hidden sm:block` (or equivalent) so they
are invisible on small screens.

---

## 🔵 Low — code quality / maintainability

### 16. Fake email generated at signup leaks implementation detail into the database

**File:** [`lib/auth-actions.ts` — `signupAction`](file:///home/patel/Projects/ticktock/lib/auth-actions.ts)

```ts
email: `${username}@ticktock.local`,
```

`better-auth` requires an email for `signUpEmail`. The workaround of fabricating a local-domain
email works but stores a meaningless value in the `user` collection. If a real email field is
ever added (e.g. for password recovery), the synthetic email will collide with real ones.

**Suggested fix:** Use `better-auth`'s `username`-only sign-up flow (the plugin supports it)
or add a separate `signUpUsername` endpoint so no fake email is required.

---

### 17. `nextCookies()` is used in both server-side auth (`lib/auth.ts`) and client-side auth (`lib/auth-client.ts`)

**File:** [`lib/auth-client.ts`](file:///home/patel/Projects/ticktock/lib/auth-client.ts)

`nextCookies` is a Next.js server plugin. Including it in the *client* `authClient` is
unusual — the client bundle does not have access to Next.js's cookie APIs. This currently
compiles without error, but it imports server-only code into the client bundle, increasing
bundle size and potentially exposing server internals.

**Suggested fix:** Remove `nextCookies()` from the `authClient` plugins array; it is only
needed on the server-side `auth` instance.

---

### 18. `db/index.ts` is not guarded by `"server-only"`

**File:** [`db/index.ts`](file:///home/patel/Projects/ticktock/db/index.ts)

`lib/session.ts` correctly imports `"server-only"`, preventing accidental client-side imports.
`db/index.ts` (which holds the MongoDB connection and collection references) does not, meaning
a mistaken `import { studySessions } from "@/db"` in a Client Component would silently
compile and only fail at runtime.

**Suggested fix:** Add `import "server-only"` at the top of `db/index.ts`.

---

### 19. `proxy.ts` is committed but its purpose is undocumented

**File:** [`proxy.ts`](file:///home/patel/Projects/ticktock/proxy.ts)

A `proxy.ts` file exists at the project root but is not referenced by any `package.json`
script, the Next.js config, or any other file. Its purpose is unclear.

**Suggested fix:** Either document it (add a comment header explaining usage) or remove it
if it is no longer needed.

---

### 20. Inline `label` elements are not associated with their inputs via `htmlFor`

**Files:** [`components/start-session.tsx#L117`](file:///home/patel/Projects/ticktock/components/start-session.tsx#L117), [`components/session-detail-modal.tsx#L131`](file:///home/patel/Projects/ticktock/components/session-detail-modal.tsx#L131), [`components/settings-view.tsx#L79`](file:///home/patel/Projects/ticktock/components/settings-view.tsx#L79)

Many `<label>` elements are adjacent to their inputs but do not use `htmlFor` / `id`
associations. Screen readers and browser autofill behaviour depend on this association.

**Impact:** Reduced accessibility; clicking a label may not focus the corresponding input.

**Suggested fix:** Add `useId()` to generate stable IDs and wire them up with `htmlFor`/`id`, as
already done correctly in `login-form.tsx`.

---

*Generated by code review — September 2026.*
