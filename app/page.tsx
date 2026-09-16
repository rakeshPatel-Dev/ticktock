import { getDashboardSummary, getAllSubjects } from "@/lib/queries";
import { Timer } from "@/components/timer";
import { DashboardSummaryView } from "@/components/dashboard-summary";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const summary = await getDashboardSummary();
  const subjects = await getAllSubjects();

  return (
    <div className="max-w-2xl mx-auto space-y-10 pb-12">
      {/* Active Timer or Idle Section */}
      <Timer initialSession={summary.activeSession} subjects={subjects} />

      {/* Today's Summary, Progress, & Recent Sessions */}
      <DashboardSummaryView summary={summary} />
    </div>
  );
}
