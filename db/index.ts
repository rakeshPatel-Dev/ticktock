import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_URL || "sqlite.db";

const globalForDb = globalThis as unknown as {
  sqlite: Database.Database | undefined;
};

export const sqlite = globalForDb.sqlite ?? new Database(dbPath);

if (process.env.NODE_ENV !== "production") {
  globalForDb.sqlite = sqlite;
}

// Enable WAL mode for reliability and performance
sqlite.pragma("journal_mode = WAL");

// Ensure the schema exists automatically
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    topic TEXT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    paused_seconds INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    outcome TEXT,
    goal TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS started_at_idx ON sessions (started_at);
  CREATE INDEX IF NOT EXISTS status_idx ON sessions (status);
  CREATE INDEX IF NOT EXISTS subject_idx ON sessions (subject);
`);

export const db = drizzle(sqlite, { schema });
