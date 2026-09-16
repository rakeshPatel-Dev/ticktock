import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: ".env.local" });

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "file:sqlite.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
