import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { username } from "better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
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