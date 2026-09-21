import { createAuthClient } from "better-auth/client";
import { usernameClient } from "better-auth/client/plugins";
import { nextCookies } from "better-auth/next-js";

export const authClient = createAuthClient({
  // NEXT_PUBLIC_BETTER_AUTH_URL is exposed to the browser bundle.
  // Falls back to the current origin when undefined (e.g. during SSR).
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  plugins: [usernameClient(), nextCookies()],
});