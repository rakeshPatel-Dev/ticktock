import { Suspense } from "react";
import { AnalyticsStream } from "@/components/analytics-stream";
import { AnalyticsSkeleton } from "@/components/skeletons";

export const dynamic = "force-dynamic";

/**
 * The heading is static and ships in the shell; the three aggregations behind
 * `AnalyticsStream` stream in under it. See the note in `app/page.tsx`.
 */
export default function AnalyticsPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 w-full">
      <div className="space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Analytics
        </h1>
        <p className="text-sm text-muted-foreground">
          Understand where your focus and study time goes with clear, honest data.
        </p>
      </div>

      <Suspense fallback={<AnalyticsSkeleton />}>
        <AnalyticsStream />
      </Suspense>
    </div>
  );
}
