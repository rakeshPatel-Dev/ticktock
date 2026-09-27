import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  isValidTimeZone,
  SERVER_TIME_ZONE,
  TIMEZONE_COOKIE,
} from "@/lib/timezone";

export const getCurrentUser = cache(async () => {
  const requestHeaders = (await headers()) as unknown as Headers;
  const session = await auth.api.getSession({ headers: requestHeaders });
  return session?.user ?? null;
});

export const getUserId = cache(async () => {
  const user = await getCurrentUser();
  return user?.id ?? null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/**
 * The IANA zone to bucket this user's calendar days in.
 *
 * A browser is the only thing that knows the user's zone, so
 * `components/timezone-sync.tsx` parks it in a cookie on mount and the queries
 * read it back here. Unvalidated on purpose: a cookie is user-writable input
 * and a bogus value reaching `$dateToString` would throw inside the aggregation
 * — a 500 from a value that should never have got that far.
 *
 * Falls back to the server's own zone, which is why the FIRST request of a
 * visit can be bucketed in UTC on a Vercel deployment. Every subsequent
 * navigation is correct; nothing is persisted, so this corrects itself rather
 * than accumulating a wrong answer.
 */
export const getUserTimeZone = cache(async (): Promise<string> => {
  const value = (await cookies()).get(TIMEZONE_COOKIE)?.value;
  return isValidTimeZone(value) ? value! : SERVER_TIME_ZONE;
});