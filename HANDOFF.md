# TickTock — Handoff Report

Status snapshot at handoff. Read this before doing anything else.

> **SUPERSEDED — the database is now MongoDB, not Turso/libSQL.**
> Everything below that mentions Turso, `db:push`, `drizzle.config.ts`, or `TURSO_*` describes
> a state that no longer exists. The Drizzle/SQLite layer was removed and replaced with the
> native `mongodb` driver; see `docs/MONGO_MIGRATION_PLAN.md` and `docs/DB_SCHEMA.md`.
> The "What has been done" section is kept as a historical record of the Better Auth port.
> The two sections after it have been rewritten to match reality.

---

## The plan (as agreed)

Port TickTock from a single-user timer to a **multi-user, auth-gated Study Session tracker**
using the **Better Auth** stack:

- Add email+username+password auth (Better Auth), protect all session CRUD behind a
  logged-in user, scope every query/action to the signed-in `userId`.
- Landing page → login/signup → authenticated session tracker, account settings, and
  subject analytics for **each user**.
- Keep it verifiable: an end-to-end verification script must pass.

Deferred by agreement from the start: **production libSQL/Turso schema push** and the
deployment/README/env docs were left for you, not auto-executed.

---

## What has been done

### Architecture / auth
- `db/schema.ts` — added `user`, `session`, `account`, `verification` tables (Better Auth
  standard), plus the existing `sessions` study-session table now carries a `userId` FK and
  per-user indexes.
- `lib/auth.ts` — Better Auth server config with email+username+password providers and a
  `username` custom field, wired to the Drizzle/better-auth adapter.
- `lib/auth-actions.ts` — server actions: signup, login, logout, change password, update
  username (each returns a `{success,error|...}` shaped result; signup email uses the
  username-derived address).
- `lib/auth-client.ts` — client-side Better Auth client used by actions.
- `lib/session.ts` — `getCurrentUser`/`getUserId` (cookie-gated) + `requireUser()` guard.
- `db/index.ts` — Turso/libSQL client fallback logic (dev → local file, prod → remote), via
  `@libsql/client` + drizzle.
- `app/api/auth/[...all]/route.ts` — Better Auth request handler.
- `app/(auth)/` — login page, signup page + their form components, auth layout (navbar
  hidden on auth routes).
- `components/account-card.tsx` — account/settings UI (username update, password change,
  sign out).

### Session domain (per-user)
- `lib/queries.ts` — `getSessions`, `getActiveSession`, `getDashboardSummary`,
  `getSubjectAnalytics` all now take the target `userId`.
- `lib/actions.ts` — create/pause/resume/finish/update/delete sessions; every action
  resolves the user from cookies and scopes queries with `eq(sessions.userId, userId)`.
  @zod validation, concurrency invariant (one active session per user), duration lock on
  completed sessions.
- All server actions are `"use server"` (cookie-gated), so the live app handles auth via
  the done routes.

### Pages
- Landing, dashboard (summary), analytics (subject analytics), sessions list, settings —
  all call the per-user query layer after resolving the signed-in user.
- `app/(auth)/` login/signup UI wired to the auth actions.

### Tooling / scripts
- `scripts/verify-e2e.ts` — headless query-layer verification, scoped to a real account
  (`npm run test:e2e -- --user <username>`). Exercises the per-user query/action surface
  since Better Auth server actions are cookie-gated.
- `drizzle.config.ts` — Turso credential handling + Drizzle Kit schema generation.

---

## What is still missing / broken — IMPORTANT

*(Rewritten after the MongoDB rewrite. The previous version of this section described a
Turso "no such table: user" blocker and a `npm run db:push` fix; both are obsolete.)*

1. **Stale `TURSO_*` variables in `.env.local`.** They are deliberately left in place and are
   now read by nothing — no source file references Turso, libSQL, or Drizzle. Safe to delete:

   ```bash
   # .env.local
   # TURSO_DATABASE_URL=...
   # TURSO_AUTH_TOKEN=...
   # the commented-out # DATABASE_URL=... line at the top
   ```

   Leave `MONGODB_URI`, `MONGODB_USERNAME`, `MONGODB_PASSWORD`, `BETTER_AUTH_SECRET`, and
   `BETTER_AUTH_URL`.

2. **No data was migrated.** The old database held 19 rows: 2 throwaway `@ticktock.local`
   accounts and 5 completed study sessions (14h 48m, subjects Complete Java / OB & HRM /
   Discrete Structure / Digital Logic). MongoDB starts empty. Recreate the account at
   `/signup`; the 5 sessions are re-typable from the export if they matter.

   Git tag `pre-mongo-rewrite` (at `785b5e2`) points at the last Turso/Drizzle commit, and the
   old Turso database is untouched and still readable.

3. **`sqlite.db` (86 KB, untracked) at the repo root is dead weight.** Nothing references it.
   It was only ever the local dev fallback. Safe to delete.

4. Better-auth error hand-off is lossy: `signupAction` collapses every server error into
   "That username is already taken." Still true. Consider surfacing the real better-auth
   message instead of blanket-mapping.

5. **RESOLVED — the `getDailyAnalytics` day-bucketing bug.** It bucketed by UTC while computing
   week boundaries in local time, so in IST sessions between 00:00 and 05:30 landed in the wrong
   day. Fixed as a separate, tested change: `lib/timezone.ts` computes zoned day/week boundaries,
   `$dateToString` gets an explicit `timezone`, and the user's IANA zone reaches the server through
   the `ticktock_tz` cookie written by `components/timezone-sync.tsx`. See `docs/DB_SCHEMA.md` and
   `docs/ISSUES.md` #3.

6. **RESOLVED — all five High issues in `docs/ISSUES.md` (#4–#8).** The daily goal is read back
   through `lib/daily-goal.ts`; pause/resume roll back and report on failure; the finish and edit
   modals surface a failed `ActionResult` instead of closing; `updateSession`/`deleteSession` return
   `SESSION_NOT_FOUND` when nothing matched (on `matchedCount`, not `modifiedCount` — see
   `docs/ISSUES.md` #7); and subject identity is one rule in `lib/subjects.ts` — normalised on
   write, folded case-insensitively on read, so historical `"Python"`/`"python"` duplicates merge
   with no migration. The first-request timezone gap is closed by a single `router.refresh()` from
   `TimezoneSync` on `/` and `/analytics`.

7. **Fixed in passing — `npm run test:e2e` could never report success.** A passing run left the
   Mongo driver's pool open and the process hung forever, so the exit code CI waits for never
   arrived. The script now closes the client and exits 0 explicitly.

---

## Suggested next step (single highest-leverage action)

```
npm run db:backfill-paused-at                 # one-off, idempotent, safe to re-run
npm run db:indexes                            # idempotent, safe to re-run
npm run build
npm run dev                                   # sign up at /signup
npm run test:e2e -- --user <your_username>
```

Then remove the `TURSO_*` lines from `.env.local` and from the Vercel project, and delete
`sqlite.db`.

---

## Verified working

Checked against a live Atlas cluster at the `pre-mongo-rewrite` rewrite:

- `npm run build` clean; `tsc --noEmit` clean; `npm run lint` clean
- Signup through the real form; `user._id` is a string UUID (not `ObjectId`), `emailVerified`
  is a boolean, auth timestamps are BSON `Date`
- `npm run db:indexes` creates all 7 indexes and is idempotent on re-run
- `npm run test:e2e -- --user <name>` — 28/28 checks, including the `active_session_uniq`
  index rejecting a second active session and the BSON `Date` ↔ epoch-seconds round-trip. Since
  the data-integrity fixes it is 55/55, adding the `pausedAt` anchor (survives a mid-pause edit),
  zoned day bucketing (the same instant files Monday in New York and Tuesday in Kolkata, a
  spring-forward day is 23h), week-scoped subject/topic panels matching the chart total, and
  stable tie-break ordering. Now **64/64**, adding subject identity: three spellings of one
  subject produce one list entry, one analytics row with the summed time, a filter that matches any
  spelling, an anchored and metacharacter-safe pattern, and the `matchedCount`-vs-`modifiedCount`
  distinction that `updateSession` relies on
- Full UI flow through Chromium: login → start → pause → resume → finish, session persisted
  and visible in `/sessions` and `/analytics`, no `NaN` / `1970` / `undefined` in analytics
- `GET /api/export?format=json` and `?format=csv` both correct
