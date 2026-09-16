import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  client: Client | undefined;
};

function getDbUrl(): string {
  const rawUrl = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;

  // Vercel functions have an ephemeral, read-only deployment filesystem. A
  // local SQLite database would therefore lose data between invocations.
  const isProduction = process.env.VERCEL || process.env.NODE_ENV === "production";

  if (!rawUrl) {
    if (isProduction) {
      throw new Error(
        "A remote database is required in production. Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN when applicable)."
      );
    }

    return "file:sqlite.db";
  }

  if (isProduction && (rawUrl === "sqlite.db" || rawUrl.startsWith("file:"))) {
    throw new Error(
      "A local SQLite database cannot be used in production. Set TURSO_DATABASE_URL to a remote libSQL/Turso database."
    );
  }

  if (
    rawUrl.startsWith("libsql:") ||
    rawUrl.startsWith("http:") ||
    rawUrl.startsWith("https:") ||
    rawUrl.startsWith("file:")
  ) {
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
