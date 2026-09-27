import { createAuthClient } from "better-auth/client";
import { usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  // NEXT_PUBLIC_BETTER_AUTH_URL is exposed to the browser bundle.
  // Falls back to the current origin when undefined (e.g. during SSR).
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  // No nextCookies() here. It is the server-side cookie plugin: its only hook
  // matches the /get-session path, and the write it performs goes through
  // next/headers, dynamically imported and swallowed on failure. In a client
  // bundle that path never matches, so the plugin could only ever drag
  // cookie-parsing code across. lib/auth.ts is where it belongs.
  plugins: [usernameClient()],
});