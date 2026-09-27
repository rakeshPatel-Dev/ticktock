import { MongoClient, type Collection, type Db } from "mongodb";
import type { StudySessionDoc, UserDoc } from "./schema";

const globalForDb = globalThis as unknown as {
  mongoClient: MongoClient | undefined;
};

/** Strips credentials out of a connection string before it reaches a log. */
function redactUri(uri: string): string {
  return uri.replace(/\/\/[^@/]*@/, "//<credentials>@");
}

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;

  // Treat everything that is not the dev server as production. Some hosts don't
  // set NODE_ENV, so relying on `=== "production"` can silently route a deployed
  // app at the local fallback.
  const isProduction = process.env.NODE_ENV !== "development";

  if (!uri) {
    if (isProduction) {
      throw new Error(
        "MONGODB_URI is required in production. Set it to a mongodb:// or mongodb+srv:// connection string."
      );
    }

    return "mongodb://127.0.0.1:27017";
  }

  if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
    throw new Error(
      `MONGODB_URI must be a mongodb:// or mongodb+srv:// connection string (got "${redactUri(uri)}").`
    );
  }

  return uri;
}

export const client =
  globalForDb.mongoClient ?? new MongoClient(getMongoUri());

if (process.env.NODE_ENV !== "production") {
  globalForDb.mongoClient = client;
}

export const db: Db = client.db();

/** The `sessions` SQL table, renamed to avoid colliding with Better Auth's `session`. */
export const studySessions: Collection<StudySessionDoc> =
  db.collection<StudySessionDoc>("studySessions");

/** Read-only convenience accessor. Writes to this collection go through Better Auth. */
export const users: Collection<UserDoc> = db.collection<UserDoc>("user");
