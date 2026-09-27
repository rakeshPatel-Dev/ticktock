# TickTock — Known Issues

> Last updated: 2026-09-27. Issues #1–#8, #11 and #16–#20 are fixed (#19 closed as not-a-bug); #9, #10, #12–#15 are open.

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

## 🔵 Low — code quality / maintainability — four fixed, one closed as not-a-bug

### 16. ~~Fake email generated at signup leaks implementation detail into the database~~ — FIXED (the premise was wrong)

**File:** [`lib/auth-actions.ts` — `signupAction`](file:///home/patel/Projects/ticktock/lib/auth-actions.ts)

```ts
email: `${username}@ticktock.invalid`,
```

**The suggested fix is not available in this version of Better Auth.** It proposed "the username-only
sign-up flow (the plugin supports it) or a separate `signUpUsername` endpoint". Neither exists:
`node_modules/better-auth/dist/plugins/username/index.mjs` registers exactly two endpoints,
`signInUsername` and `isUsernameAvailable`, while the core `signUpEmail` validates the address with
`z.email()` and declares `email` / `emailVerified` required on the user model. A synthetic address is
therefore structural, not a workaround, and removing it would mean forking the auth flow.

What was actually wrong was the domain. `.local` is reserved by RFC 6762 for mDNS — it is a domain
software will try to resolve and, unlike `.invalid`, try to accept mail for. `.invalid` is reserved by
RFC 2606 as *guaranteed never to resolve*. It also closes the collision risk the issue raised: no real
domain exists in that TLD, so a future real email feature cannot produce an address that clashes with
a synthetic one, and the address is unique per user because the username is.

The two throwaway accounts already in the database still carry `@ticktock.local`; only new sign-ups
use the new domain.

---

### 17. ~~`nextCookies()` is used in both server-side auth and client-side auth~~ — FIXED

**File:** [`lib/auth-client.ts`](file:///home/patel/Projects/ticktock/lib/auth-client.ts)

`nextCookies` is the server-side cookie plugin and has no client-side job. Its only hook matches
`ctx.path === "/get-session"`, and the cookie write it performs goes through `next/headers`, which it
imports dynamically and swallows on failure. In a browser that path never matches, so the plugin could
only ever drag `parseSetCookieHeader` / `toCookieOptions` across the client boundary.

Removed from `authClient`, with the reason in a comment. It stays in `lib/auth.ts`, which is the
instance that serves `/get-session`.

---

### 18. ~~`db/index.ts` is not guarded by `"server-only"`~~ — FIXED

**Files:** [`db/index.ts`](file:///home/patel/Projects/ticktock/db/index.ts), [`package.json`](file:///home/patel/Projects/ticktock/package.json)

`db/index.ts` now imports `"server-only"`, so a Client Component that reaches for the collection
handles is a build error instead of a runtime failure whose message contains a connection string.
`db/indexes.ts` inherits the guard through its import of this module.

**This needed a second change, which the issue did not anticipate.** The marker package resolves to a
throwing entry under the default condition and to an empty module under `react-server` — the condition
Next.js sets for server code. The three `tsx` scripts import this file, so without help they hit the
throwing entry and died before doing any work. All three now run `tsx --conditions=react-server`, which
is the same condition Next uses rather than a workaround for it:

```
db:indexes            tsx --conditions=react-server scripts/create-indexes.ts
db:backfill-paused-at tsx --conditions=react-server scripts/backfill-paused-at.ts
test:e2e              tsx --conditions=react-server scripts/verify-e2e.ts
```

**`db/schema.ts` is deliberately not marked.** Five client components import its types and
`pauseAnchorSeconds` from it, and it holds no connection — only the connection and the collection
handles live in `db/index.ts`.

Verified by probe, not assumed: a temporary client component importing `@/db` fails the build with
*"You're importing a module that depends on `server-only`"*, and the build passes without it.

---

### 19. ~~`proxy.ts` is committed but its purpose is undocumented~~ — CLOSED, not a bug

**File:** [`proxy.ts`](file:///home/patel/Projects/ticktock/proxy.ts)

`proxy.ts` is the Next.js 16 successor to `middleware.ts`, and Next discovers it **by convention** —
which is why the issue's evidence ("not referenced by any package.json script, the Next.js config, or
any other file") found nothing: there is nothing to reference. The file matches the documented shape
exactly — project root, `export function proxy(request: NextRequest)`, alongside `config.matcher`
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`), and the build
output lists it under *"ƒ Proxy (Middleware)"*.

It is also already documented: a header comment states what it does, both Better Auth cookie names it
accepts, and that it is *not* a substitute for per-action auth. That warning is the framework's own —
the same page says to always verify authorization inside each Server Function, because a matcher change
can silently remove Proxy coverage.

No change made. Left as is deliberately.

---

### 20. ~~Inline `label` elements are not associated with their inputs via `htmlFor`~~ — FIXED

**Files:** [`components/start-session.tsx`](file:///home/patel/Projects/ticktock/components/start-session.tsx), [`components/session-detail-modal.tsx`](file:///home/patel/Projects/ticktock/components/session-detail-modal.tsx), [`components/session-form.tsx`](file:///home/patel/Projects/ticktock/components/session-form.tsx), [`components/settings-view.tsx`](file:///home/patel/Projects/ticktock/components/settings-view.tsx)

Ten unassociated labels, wired with `useId()` as `login-form.tsx` and `account-card.tsx` already do:
the three start-session fields, the five edit-modal fields, and the two settings fields. The issue named
three of the four files and missed `session-form.tsx`; `signup-form.tsx` was already correct.

**Two of them were not field labels, and `htmlFor` would have been the wrong fix.** "Appearance" and
"What did you accomplish?" name a *set* of toggles, not one control. Pointing a `<label>` at the first
button in a set labels only that button and misleads a screen reader about the rest. Both became a
labelled group instead — the visible text keeps its styling as a `<span id>`, the container takes
`role="group"` + `aria-labelledby`, and the toggles take `aria-pressed` so the selection is announced
rather than conveyed by background colour alone.

Also in `settings-view.tsx`, while the field was already open: the goal input had `aria-invalid` with
nothing describing *why* it was invalid. The error `<p>` now has an `id` that the input points at with
`aria-describedby`, and `role="alert"` so a rejected value is announced when it appears.

Checked mechanically afterwards: every `<label>` in `app/` and `components/` now resolves to a control.

---

*Generated by code review — September 2026.*
