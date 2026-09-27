import { Suspense } from "react";
import { SessionsStream } from "@/components/sessions-stream";
import { SessionsSkeleton } from "@/components/skeletons";

export const dynamic = "force-dynamic";

export default function SessionsPage() {
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

      <Suspense fallback={<SessionsSkeleton />}>
        <SessionsStream />
      </Suspense>
    </div>
  );
}
