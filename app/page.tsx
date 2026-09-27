import { getDashboardSummary, getAllSubjects } from "@/lib/queries";
import { getUserTimeZone, requireUser } from "@/lib/session";
import { Timer } from "@/components/timer";
import { DashboardSummaryView } from "@/components/dashboard-summary";
import { TimezoneSync } from "@/components/timezone-sync";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  // "Today" is the user's midnight, not the server's — see lib/timezone.ts.
  const timeZone = await getUserTimeZone();
  const summary = await getDashboardSummary(user.id, new Date(), timeZone);
  const subjects = await getAllSubjects(user.id);

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-12 w-full">
      {/* Re-renders this page once if the numbers above were computed in the
          server's fallback zone because this was the user's first request. */}
      <TimezoneSync serverTimeZone={timeZone} />

      {/* Active Timer or Idle Section */}
      <Timer initialSession={summary.activeSession} subjects={subjects} />

      {/* Today's Summary, Progress, & Recent Sessions */}
      <DashboardSummaryView summary={summary} />
    </div>
  );
}
