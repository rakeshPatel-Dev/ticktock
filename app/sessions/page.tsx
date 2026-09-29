import { Suspense } from "react";
import { SessionsStream } from "@/components/sessions-stream";
import { SessionsSkeleton } from "@/components/skeletons";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default function SessionsPage() {
  return (
    <div className="space-y-5 w-full">
      <PageHeader
        title="Sessions"
        description="Every session you have finished."
      />

      <Suspense fallback={<SessionsSkeleton />}>
        <SessionsStream />
      </Suspense>
    </div>
  );
}
