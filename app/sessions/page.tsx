import { getSessions, getAllSubjects } from "@/lib/queries";
import { SessionListView } from "@/components/session-list";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const [sessionsList, subjects] = await Promise.all([
    getSessions(),
    getAllSubjects(),
  ]);

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Sessions
        </h1>
        <p className="text-xs text-muted-foreground">
          Detailed history of your focused coding and study intervals.
        </p>
      </div>

      <SessionListView
        initialSessions={sessionsList}
        subjects={subjects}
      />
    </div>
  );
}
