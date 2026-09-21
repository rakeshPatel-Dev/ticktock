import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  client: Client | undefined;
};

function getDbUrl(): string {
  const rawUrl = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL;

  // Treat everything that is not the dev server as production. Some hosts
  // don't set NODE_ENV, so relying on `=== "production"` can silently route a
  // deployed app to the local SQLite fallback and blow up with SQLITE_CANTOPEN.
  const isProduction = process.env.NODE_ENV !== "development";

  if (!rawUrl) {
    if (isProduction) {
      throw new Error(
        "A remote database is required in production. Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN when applicable)."
      );
    }

    return "file:sqlite.db";
  }

  const isRemoteUrl =
    rawUrl.startsWith("libsql:") ||
    rawUrl.startsWith("http:") ||
    rawUrl.startsWith("https:") ||
    rawUrl.startsWith("ws:") ||
    rawUrl.startsWith("wss:");

  // In production local disk is ephemeral and read-only. Reject any non-remote
  // URL (file paths, bare `sqlite.db`, ...) up front with a clear message
  // instead of a cryptic "unable to open database file" at connect time.
  if (isProduction && !isRemoteUrl) {
    throw new Error(
      `A local SQLite database cannot be used in production (got "${rawUrl}"). Set TURSO_DATABASE_URL to a remote libSQL/Turso URL.`
    );
  }

  if (isRemoteUrl) {
    return rawUrl;
  }

  return `file:${rawUrl}`;
}

export const client =
  globalForDb.client ??
  createClient({
    url: getDbUrl(),
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.client = client;
}

export const db = drizzle(client, { schema });
