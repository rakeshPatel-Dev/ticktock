# TickTock — Known Issues

> Last updated: 2026-09-28. Issues #1–#8, #11, #13, #16–#20 and #21–#24 are fixed (#19 closed as
> not-a-bug); #9, #10, #12, #14, #15 are open.
>
> #21 and #22 are the two live bugs in the old timer, found after that review. #23 is the test gap
> that let both ship. #24, and the correction to #13, were found by driving the real app in a
> browser — a layer the suite does not reach.

This document catalogues bugs, design weaknesses, and missing features discovered during a code review of the TickTock codebase. Issues are grouped by severity.

---

## ✅ Critical / Data-integrity — all fixed

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

`$dateToString` without a `timezone` option formats in UTC while the week bounds were
computed in local time. A session at 11 PM local in a UTC+ zone was keyed as the next day — a key
outside the range, so its minutes were dropped rather than shown on the wrong bar.

**Now:** `lib/timezone.ts` is the single place calendar boundaries are computed.

- The user's IANA zone is published by `components/timezone-sync.tsx` (rendered in the root layout)
  to the `ticktock_tz` cookie, and read back by `lib/session.ts#getUserTimeZone` with validation —
  a cookie is user-writable and an unvalidated value would throw inside `$dateToString`.
- `getDailyFocus` passes `timezone` to `$dateToString` via `dateToStringOptions(tz)`. Its day keys
  therefore always agree with the zone that produced the range bounds.
- `getDashboardSummary` uses `getDayRange` for "today", so the dashboard's day boundary is the user's
  midnight rather than the server's.
- `getDayRange` ends a day at the start of the next day, so DST days are 23/25 hours rather than a
  flat 24. `verify-e2e.ts` asserts the 23-hour case, and that the same instant files on Monday in
  New York but on Tuesday in Kolkata.

Known, accepted limitation: with no cookie yet — the first request of a visit on a UTC host — the
fallback is the server's zone. It self-corrects from the second navigation on and is not persisted,
so it cannot accumulate.

---

### 21. ~~The timer starts late, and stays permanently offset~~ — FIXED

**Files:** [`lib/actions.ts`](file:///home/patel/Projects/ticktock/lib/actions.ts),
[`lib/timer-store.ts`](file:///home/patel/Projects/ticktock/lib/timer-store.ts)

**Was:** `createSession` stamped `startedAt` with the **server's** clock,
`Math.floor(Date.now() / 1000)`, and the running timer measured against the
**browser's** `Date.now()`. Two separate defects in one line:

- **Truncation bias.** The server clock was floored, so the first tick returned
  `frac(realStartInstant)` instead of `0` — up to a second of free credit.
- **Clock skew, and it never self-corrected.** `Math.max(0, …)` clamped at zero,
  so whenever the server clock ran ahead of the browser the display sat at
  `00:00:00` until the browser caught up. It then stayed offset by exactly the
  skew, because every subsequent tick was client arithmetic on a server-stamped
  origin.

**Now:** the client owns the clock, so it owns the start instant too. `createSession`
takes `startedAt` from the user — which is also the *more* consistent choice, since
"today" is already bucketed by the user's midnight in `getDayRange`, so their clock
agrees with the grouping they expect. An open run segment is measured with
`performance.now()`, which is monotonic and immune to NTP corrections, DST, and a
user editing their system clock mid-session.

A supplied `startedAt` more than `MAX_START_SKEW_SECONDS` from the server's, or
older than a week, is refused in favour of the server's own clock — a guard on a
wrong system clock, not a trust boundary.

---

### 22. ~~Pausing collapses the display to `00:00:00`; resuming jumps it forward by the whole pause~~ — FIXED

**Files:** [`components/timer.tsx`](file:///home/patel/Projects/ticktock/components/timer.tsx),
[`lib/timer-store.ts`](file:///home/patel/Projects/ticktock/lib/timer-store.ts)

**Was:** pause and resume were optimistic local updates standing in for a server
value. `handlePause` did `setSession({ ...previous, status: "paused" })` — which
sets `status` but not `pausedAt`, and a running row always has `pausedAt: null`. The
optimistic paused object therefore reached `pauseAnchorSeconds`, fell through to its
`?? updatedAt` legacy shim, and found `updatedAt === startedAt` for any session that
had never been edited:

```text
raw = max(0, startedAt - startedAt) = 0
```

So pausing at 40 minutes instantly collapsed the display to `00:00:00`, then jumped
back to 40:00 when the revalidation landed. Resume was the mirror image:
`pausedSeconds` did not yet include the pause that had just ended, so the display
jumped *forward* by the entire pause length, then snapped back. Both were
guaranteed, every time.

**Now:** pause and resume are pure local transitions with no request at all, and the
only pause anchor is the one the client itself wrote. There is no server value to
imitate, so there is no window in which the two can disagree. A row is `active` for
its whole life and flips to `completed` once.

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

### 13. ~~`clearAllSessions` does not guard against an active session being deleted mid-timer~~ — FIXED

**Was:** [`lib/actions.ts`](file:///home/patel/Projects/ticktock/lib/actions.ts)

`clearAllSessions` deletes every document including active/paused sessions, and the
timer on the dashboard received no server-push notification — so it kept counting
against a row that no longer existed, and on the next revalidation tried to act on a
session ID that was gone.

**Now:** fixed, but not the way the first attempt claimed, and the wrong version is
worth recording because the test suite passed straight over it.

The first attempt asserted that the client-authoritative rework had fixed this for
free, on the grounds that `reconcileFromServer` compares the local record against
whatever the server has and drops it when the server has nothing. That is true of
the code, and it was still broken in the most ordinary sequence a user performs:

```text
load the dashboard, nothing open   → reconcile runs, records "no remote session"
start a session                    → store takes the row; the recorded id is stale
finish or delete that session      → reconcile runs, and skips
```

`reconcileFromServer` had a fast path that skipped the entire reconcile when the
remote id matched the last one it reconciled. `null` means both "the server has
nothing open" and "the row you were holding is gone", and after a start the
recorded id was still `null` — so finishing or deleting the session hit the fast
path, the local record was never dropped, and the timer kept counting against a
deleted row with no way to clear it short of a full page reload. The "Ready to
focus?" hero never came back.

Two changes, either of which is sufficient:

- `startFromServer` records the new row's id, so the next reconcile has a real id
  to compare against instead of a stale `null`.
- The fast path refuses to skip when the remote is `null` *and* a local record
  exists — the only ambiguous case. Extracted as `canSkipReconcile` and asserted
  across all five combinations in `scripts/verify-e2e.ts`.

Found by driving the real app in a browser, not by the test suite. Every
unit-level check of the old `reconcileFromServer` used a freshly imported module,
where `reconciledRemoteId` is still `undefined` and the fast path cannot fire at
all. A test that cannot reach the bug is not evidence the bug is gone.

---

### 14. No `"week"` filter date range check for the current partial week in Sessions page

**File:** [`components/session-list.tsx#L56-L60`](file:///home/patel/Projects/ticktock/components/session-list.tsx#L56)

The "This week" filter checks `sessionDate < oneWeekAgo` (a rolling 7-day window), but the
analytics page defines "this week" as Sun–Sat. The two date ranges are inconsistent, creating
a confusing discrepancy between the Sessions list and the Analytics weekly chart.

**Suggested fix:** Use a calendar Sun–Sat boundary in `SessionListView` to match the range
`lib/analytics-range.ts` resolves for the week.

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

### 23. ~~The timing core had no tests at all~~ — FIXED

**File:** [`scripts/verify-e2e.ts`](file:///home/patel/Projects/ticktock/scripts/verify-e2e.ts)

The old `calculateDuration` was never imported by the test script. Its "pause" and "resume" steps
wrote `{ status, updatedAt }` straight to Mongo and asserted that a string round-tripped — which
exercised none of the arithmetic and never went near `pauseSession`/`resumeSession`. The
`updateMany` in step 8 wrote a fabricated `durationSeconds: 3600`.

So the entire thing was untested at the level that matters, and issues #21 and #22 were both
sitting in code no test touched.

The rework replaced it with a pure state machine in `lib/timer.ts` whose every transition takes
`now` as an argument, so it is testable with no browser, no fake timers, and no network. 24
assertions now cover the properties the reported bugs actually violated:

- elapsed is identical at 10Hz, 1Hz, and with three ticks in thirty seconds;
- pause freezes the number indefinitely; pausing twice banks once; starting twice discards nothing;
- resume continues from the banked value;
- a reload that restarts `performance.now()` at zero does not reset the timer, and does not go
  negative;
- after a restore the display is measured monotonically again, so a system clock jump cannot move it;
- a run/pause/run cycle survives a reload with both segments;
- `localStorage` garbage is refused rather than rendered as `NaN`;
- `resolveStartedAt` keeps a plausible client instant and falls back for a wildly wrong one.

---

### 24. ~~The timer hydrated against a number the server could only guess~~ — FIXED

**Files:** [`lib/timer-store.ts`](file:///home/patel/Projects/ticktock/lib/timer-store.ts),
[`components/timer.tsx`](file:///home/patel/Projects/ticktock/components/timer.tsx)

**Was:** `useTimerSnapshot` passed one `getSnapshot` as both the client and the
server snapshot, on the reasoning — stated in a comment — that seeding the store
during render would make the two sides agree. They agree only until the first
reconcile reads the checkpoint.

Since pausing is local by design, the server has never heard about it. A paused
session is an `active` row in Mongo, so a page load rendered
`elapsed = now - startedAt` and got a confidently wrong number. Loading a session
paused at 36 seconds put `00:00:58` on the screen and then settled on `00:00:36`
once hydration read the checkpoint — the same jump-and-snap-back this rework
exists to remove, reappearing at a different layer. React was throwing the tree
away and rebuilding it: `Hydration failed because the server rendered text didn't
match the client`.

**Now:** the server renders nothing it would have to invent. `getServerSnapshot`
and `getClientSnapshot` are separate functions; until an effect after hydration
both return the same constant `PENDING_SNAPSHOT`, and the running/paused card
renders a `--:--:--` placeholder until then. The idle hero is not gated — with no
session it is a pure function of `initialSession === null` and already agrees.

The gate is deliberately scoped to `initialSession` being present. Gating
everything was the first attempt, and it hid the "Ready to focus?" hero behind a
placeholder on every load.

`seedFromServer` also moved out of render into that effect. Publishing a snapshot
during `Timer`'s render notified `TimerBody` mid-render, which React refuses with
*"Cannot update a component while rendering a different component"*.

Found by loading a paused session in a real browser. No unit test could have
caught any of it: every timing assertion in the suite runs in Node, where there
is no server render and no hydration pass.

---

*Generated by code review — September 2026. Issues #21–#24 added by the timer rework.*
