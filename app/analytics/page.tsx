import { Suspense } from "react";
import { AnalyticsStream } from "@/components/analytics-stream";
import { AnalyticsSkeleton } from "@/components/skeletons";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

/**
 * The heading is static and ships in the shell; the three aggregations behind
 * `AnalyticsStream` stream in under it. See the note in `app/page.tsx`.
 */
export default function AnalyticsPage() {
  return (
    <div className="space-y-5 w-full">
      <PageHeader
        title="Analytics"
        description="Where your focus actually goes, week by week."
      />

      <Suspense fallback={<AnalyticsSkeleton />}>
        <AnalyticsStream />
      </Suspense>
    </div>
  );
}
