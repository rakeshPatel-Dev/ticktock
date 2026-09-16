# TickTock

A focused time-tracking app built with Next.js and Drizzle.

## Local development

Copy `.env.example` to `.env.local` and provide a Turso database URL and token. Without those values, local development uses `sqlite.db` automatically.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploying to Vercel

The repository includes `vercel.json`; Vercel installs dependencies with `npm ci` and deploys with `npm run build`.

Before the first deployment:

1. Create a hosted [Turso](https://turso.tech/) database.
2. Apply the tracked schema migration to it from a machine with the Turso credentials:

   ```bash
   TURSO_DATABASE_URL="libsql://..." TURSO_AUTH_TOKEN="..." npm run db:push
   ```

3. Import the repository into Vercel.
4. In **Project Settings → Environment Variables**, add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` for Production, Preview, and Development as appropriate. The expected names are listed in `.env.example`.

Vercel functions do not provide persistent local disk storage. TickTock therefore requires a remote libSQL/Turso database in production and fails with a clear configuration error if one is absent.

To deploy from the CLI after authenticating:

```bash
npx vercel
```
