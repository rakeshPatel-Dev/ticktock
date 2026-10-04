import { Suspense } from "react";
import { AnalyticsStream } from "@/components/analytics-stream";
import { AnalyticsSkeleton } from "@/components/skeletons";
import { PageHeader } from "@/components/page-header";
import { AnalyticsRangeFilter } from "@/components/analytics-range-filter";
import {
  DEFAULT_ANALYTICS_RANGE,
  isAnalyticsRange,
  RANGE_PROSE,
} from "@/lib/analytics-range";

export const dynamic = "force-dynamic";

/**
 * The heading and the range control are static with respect to the range and
 * ship in the shell; the aggregations behind `AnalyticsStream` stream in under
 * them. See the note in `app/page.tsx`.
 *
 * The filter sits OUTSIDE the boundary on purpose. Inside it, every range switch
 * would replace the control with the skeleton and then hand it back — the one
 * control a user is about to press again would be the only thing on screen that
 * flickers. Out here it stays mounted, and only the numbers change.
 *
 * `searchParams` is a promise in this version, and awaiting it is what makes the
 * page's own output depend on the URL. The page was already `force-dynamic`, so
 * this costs nothing that was not already being paid.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { range } = await searchParams;
  // Anything unrecognised — a hand-edited URL, a `?range=` with no value, the
  // param repeated — lands on the default rather than rendering a broken page.
  const selected = isAnalyticsRange(range) ? range : DEFAULT_ANALYTICS_RANGE;

  return (
    <div className="space-y-5 w-full">
      <PageHeader
        title="Analytics"
        description="Where your focus actually goes, over any stretch of time."
      />

      <AnalyticsRangeFilter current={selected} />

      <Suspense fallback={<AnalyticsSkeleton rangeLabel={RANGE_PROSE[selected].label} />}>
        <AnalyticsStream range={selected} />
      </Suspense>
    </div>
  );
}