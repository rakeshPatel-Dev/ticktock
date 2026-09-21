import { sql, SQL } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

const epochMs = (): SQL =>
  sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  username: text("username").notNull().unique(),
  displayUsername: text("display_username"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(epochMs())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(epochMs())
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(epochMs())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(epochMs())
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_idx").on(table.userId)]
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(epochMs())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(epochMs())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_user_idx").on(table.userId)]
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(epochMs())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(epochMs())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    subject: text("subject").notNull(),
    topic: text("topic"),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at"),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    pausedSeconds: integer("paused_seconds").notNull().default(0),
    status: text("status", { enum: ["active", "paused", "completed"] })
      .notNull()
      .default("active"),
    outcome: text("outcome"),
    goal: text("goal"),
    notes: text("notes"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("started_at_idx").on(table.startedAt),
    index("status_idx").on(table.status),
    index("subject_idx").on(table.subject),
    index("sessions_user_idx").on(table.userId),
  ]
);

export type StudySession = typeof sessions.$inferSelect;
export type NewStudySession = typeof sessions.$inferInsert;
