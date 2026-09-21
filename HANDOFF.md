# TickTock — Handoff Report

Status snapshot at handoff. Read this before doing anything else.

---

## The plan (as agreed)

Port TickTock from a single-user timer to a **multi-user, auth-gated Study Session tracker**
using the **Better Auth** stack:

- Add email+username+password auth (Better Auth), protect all session CRUD behind a
  logged-in user, scope every query/action to the signed-in `userId`.
- Landing page → login/signup → authenticated session tracker, account settings, and
  subject analytics for **each user**.
- Keep it verifiable: seed + an end-to-end verification script must pass.

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
- `scripts/seed.ts` — seeds realistic sample sessions **for a specific existing account**
  (`npm run db:seed -- --user <username>`); resolves the user by username.
- `scripts/verify-e2e.ts` — headless query-layer verification, scoped to a real account
  (`npm run test:e2e -- --user <username>`). Exercises the per-user query/action surface
  since Better Auth server actions are cookie-gated.
- `drizzle.config.ts` — Turso credential handling + Drizzle Kit schema generation.

---

## What is still missing / broken — IMPORTANT

1. **The remote Turso database is empty (no schema).** This is the blocker that makes the
   app appear "broken": `.env.local` points `TURSO_DATABASE_URL` (and `DATABASE_URL`) at the
   **remote Turso** endpoint, but no `user` table exists there. Consequence:
   - **Every signup fails with "That username is already taken."** for *every* username.
     Root cause: the DB returns `SQLITE_ERROR: no such table: user` → Better Auth 500 →
     `signupAction` maps **any** better-auth error to "already taken." (Confirmed by direct
     HTTP probe: `POST /api/auth/sign-up/email` → HTTP 500, `SQLITE_ERROR: no such table:
     user`.)
   - The `86KB sqlite.db` that exists at repo root is only the **local dev** fallback
     (`NODE_ENV=development` + no URL → `file:sqlite.db`). It is NOT the DB the app uses in
     production/normal config. Seeding it does not fix remote signup.

   **Fix: push the schema to the remote Turso DB.** Run (you do this — it writes to your
   Turso account):
   ```bash
   npm run db:push   # drizzle-kit push against TURSO_DATABASE_URL
   ```
   then re-verify signup at `/signup`.

2. `scripts/verify-e2e.ts` was rewritten to target the per-user query layer but has not been
   executed successfully end-to-end yet (it requires a real account, which you can't create
   until item 1 is fixed). `npm run test:e2e -- --user <username>` is the command.

3. Better-auth error hand-off is lossy: `signupAction` collapses every server error into
   "That username is already taken." Once the DB is correct this is only a cosmetic UX gap,
   but consider surfacing the real better-auth message instead of blanket-mapping.

4. README + `.env` docs were intentionally left for you (deferred scope). Document
   `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` usage.

---

## Suggested next step (single highest-leverage action)

```
npm run db:push          # migrate remote Turso schema
npm run db:seed -- --user <your_username>    # after you create the account
npm run test:e2e -- --user <your_username>
npm run build
```

Once `db:push` succeeds, signup stops failing and the whole flow is testable.
