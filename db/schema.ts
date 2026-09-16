import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
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
  ]
);

export type StudySession = typeof sessions.$inferSelect;
export type NewStudySession = typeof sessions.$inferInsert;
