"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  TIMEZONE_COOKIE,
  TIMEZONE_COOKIE_MAX_AGE,
} from "@/lib/timezone";

/**
 * Publishes the browser's IANA timezone to the server.
 *
 * Renders nothing. The server cannot know which zone the user is in, and every
 * calendar-day question — "today's total", "which day was this session on" —
 * has a different answer per zone. This writes the zone to a cookie on mount;
 * `lib/session.ts#getUserTimeZone` reads it back and hands it to the queries.
 *
 * Rendered from the root layout so it runs on every route, including ones that
 * never touch analytics: the value has to be in the cookie BEFORE the first
 * analytics request, not after a special visit to that page.
 *
 * Only writes when the value changed — a fresh cookie on every mount would
 * invalidate caches for a zone that did not move, and would re-send the request
 * on every navigation.
 *
 * `serverTimeZone` is optional and only passed by the pages whose *numbers*
 * depend on the zone (dashboard, analytics). It closes the first-request gap: on
 * a first visit the cookie did not exist yet, so that render was computed in the
 * server's fallback zone and is wrong by up to a day. Once the cookie is
 * written, re-running the RSC render produces the correct numbers. Without this
 * the user sees a wrong "today" until they navigate somewhere that re-fetches.
 *
 * The layout instance is left without the prop on purpose: reading the cookie
 * in the root layout would make the static sign-in and sign-up pages dynamic to
 * service a component that does nothing for them.
 */
export function TimezoneSync({ serverTimeZone }: { serverTimeZone?: string } = {}) {
  const router = useRouter();
  const hasRefreshed = React.useRef(false);

  React.useEffect(() => {
    let timeZone: string;
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    } catch {
      return;
    }
    if (!timeZone) return;

    const current = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${TIMEZONE_COOKIE}=`))
      ?.slice(TIMEZONE_COOKIE.length + 1);

    if (current !== timeZone) {
      document.cookie = `${TIMEZONE_COOKIE}=${encodeURIComponent(timeZone)}; path=/; max-age=${TIMEZONE_COOKIE_MAX_AGE}; samesite=lax`;
    }

    // The cookie was just written, so the next RSC render reads the real zone
    // and `serverTimeZone` will match — which is what makes this a single
    // refresh rather than a loop. The ref guards the case where the user's zone
    // is genuinely invalid on the server, where matching never happens.
    if (
      serverTimeZone &&
      serverTimeZone !== timeZone &&
      !hasRefreshed.current
    ) {
      hasRefreshed.current = true;
      router.refresh();
    }
  }, [router, serverTimeZone]);

  return null;
}
