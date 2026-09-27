# TickTock

A focused time-tracking app built with Next.js and MongoDB.

## Local development

Copy `.env.example` to `.env.local` and set `MONGODB_URI` to your MongoDB connection string. Without it, local development falls back to `mongodb://127.0.0.1:27017`.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

There is no migration step. The `studySessions` indexes are created idempotently by:

```bash
npm run db:indexes
```

Auth collections (`user`, `session`, `account`, `verification`) are created automatically by Better Auth on first signup.

## Deploying to Vercel

The repository includes `vercel.json`; Vercel installs dependencies with `npm ci` and deploys with `npm run build`.

Before the first deployment:

1. Create a [MongoDB Atlas](https://www.mongodb.com/atlas) cluster. **Put it in the same region as your Vercel functions** — a cross-region database is the single most common reason this app feels slow, and no amount of query tuning fixes it.
2. Create a database user with read/write access, and add Vercel's outbound IP range to the IP access list (or use Atlas Serverless / Data API to avoid IP management entirely).
3. Import the repository into Vercel.
4. In **Project Settings → Environment Variables**, add `MONGODB_URI` and `BETTER_AUTH_SECRET` for Production, Preview, and Development as appropriate. The expected names are listed in `.env.example`.
5. Run `npm run db:indexes` once from a machine that can reach the cluster.

`MONGODB_URI` is required in production. TickTock fails the build with a clear configuration error if it is absent or malformed — there is no local-file fallback, because Vercel functions have no persistent local disk.

To deploy from the CLI after authenticating:

```bash
npx vercel
```

## Data model

One collection, `studySessions`, holds everything the app owns. Timestamps are stored as BSON `Date`; the domain layer converts to and from epoch **seconds** at the data-layer boundary (`db/schema.ts`), so `lib/timer.ts` and all UI components are unchanged. See [`docs/DB_SCHEMA.md`](./docs/DB_SCHEMA.md).

## Tests

```bash
npm run test:e2e -- --user <username>   # query-layer verification, run against a real account
npm run lint
npx tsc --noEmit
```

> ⚠️ `npm run test:e2e -- --user <username>` **deletes every session belonging to that
> account** before it runs, and again on the way out — it ends with zero sessions. Point it at a
> throwaway account, never at the one whose history you care about.
