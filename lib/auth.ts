import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { username } from "better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { db } from "@/db";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  // `client` is deliberately not passed: doing so makes the adapter wrap
  // operations in Mongo transactions, which require a replica set. This app has
  // no transactions, and a bare local `mongod` is not one.
  database: mongodbAdapter(db, { usePlural: false }),
  advanced: {
    database: {
      // A *function* here makes the mongo adapter skip all ObjectId/UUID coercion
      // of `_id` and of fields referencing `id`, so every auth `_id` stays a
      // string. Matches `crypto.randomUUID()` in lib/actions.ts, so auth IDs and
      // study-session IDs share one convention.
      generateId: () => crypto.randomUUID(),
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  plugins: [
    username({
      usernameValidator: (value) => /^[a-zA-Z0-9_.-]{3,30}$/.test(value),
    }),
    nextCookies(),
  ],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const isSignUp = ctx.path === "/sign-up/email";
      const isUpdateUser = ctx.path === "/update-user";
      if (!isSignUp && !isUpdateUser) return;

      const username = ctx.body?.username;
      if (typeof username !== "string" || username.length === 0) {
        throw new APIError("BAD_REQUEST", {
          message: "Username is required",
        });
      }
    }),
  },
  trustedOrigins: [process.env.BETTER_AUTH_URL as string].filter(Boolean),
});