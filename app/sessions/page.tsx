import { getSessions, getAllSubjects } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { SessionListView } from "@/components/session-list";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const user = await requireUser();
  const [sessionsList, subjects] = await Promise.all([
    getSessions(user.id),
    getAllSubjects(user.id),
  ]);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 w-full">
      <div className="space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Sessions
        </h1>
        <p className="text-sm text-muted-foreground">
          Complete history of your focused work, study, and creative sessions.
        </p>
      </div>

      <SessionListView
        initialSessions={sessionsList}
        subjects={subjects}
      />
    </div>
  );
}
