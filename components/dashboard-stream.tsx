import { getActiveSession, getAllSubjects, getDashboardSummary } from "@/lib/queries";
import { getUserTimeZone, requireUser } from "@/lib/session";
import { Timer } from "@/components/timer";
import { DashboardSummaryView } from "@/components/dashboard-summary";
import { TimezoneSync } from "@/components/timezone-sync";

/**
 * The dashboard's two data regions, as separate server components so each can
 * sit behind its own `<Suspense>` boundary in `app/page.tsx`.
 *
 * The split is not cosmetic: the two regions answer different questions and
 * read different rows, so giving them independent boundaries lets the Timer — the
 * one interactive control on the page — paint off a single indexed read instead
 * of waiting behind the day's aggregates. `requireUser()` is called in both,
 * but `getCurrentUser` is wrapped in React `cache()`, so the auth lookup still
 * happens exactly once per request no matter how many boundaries ask.
 */

export async function TimerStream() {
  const user = await requireUser();
  const [activeSession, subjects] = await Promise.all([
    getActiveSession(user.id),
    getAllSubjects(user.id),
  ]);

  return <Timer initialSession={activeSession} subjects={subjects} />;
}

export async function SummaryStream() {
  const user = await requireUser();
  // "Today" is the user's midnight, not the server's — see lib/timezone.ts.
  const timeZone = await getUserTimeZone();
  // `false`: the active session belongs to TimerStream, and reading it again
  // here would repeat one query for an answer this region never uses.
  const summary = await getDashboardSummary(user.id, new Date(), timeZone, false);

  return (
    <>
      {/* Re-renders this page once if the numbers above were computed in the
          server's fallback zone because this was the user's first request. */}
      <TimezoneSync serverTimeZone={timeZone} />
      <DashboardSummaryView summary={summary} />
    </>
  );
}
