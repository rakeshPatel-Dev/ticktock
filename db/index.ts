import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  client: Client | undefined;
};

function getDbUrl(): string {
  const rawUrl =
    process.env.TURSO_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "file:sqlite.db";

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
