import { getDashboardSummary, getAllSubjects } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { Timer } from "@/components/timer";
import { DashboardSummaryView } from "@/components/dashboard-summary";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const summary = await getDashboardSummary(user.id);
  const subjects = await getAllSubjects(user.id);

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-12 w-full">
      {/* Active Timer or Idle Section */}
      <Timer initialSession={summary.activeSession} subjects={subjects} />

      {/* Today's Summary, Progress, & Recent Sessions */}
      <DashboardSummaryView summary={summary} />
    </div>
  );
}
