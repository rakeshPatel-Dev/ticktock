import { Suspense } from "react";
import { SummaryStream, TimerStream } from "@/components/dashboard-stream";
import {
  SummarySkeleton,
  TimerSkeleton,
} from "@/components/skeletons";

export const dynamic = "force-dynamic";

/**
 * Synchronous on purpose.
 *
 * This component awaits nothing, so it produces the route's static shell and
 * Next flushes it on the first render pass — heading, nav and both skeletons.
 * The queries live in the two streams behind their own boundaries and stream in
 * independently. Awaiting here instead is what made every navigation feel
 * frozen: the browser got no bytes at all until the last query resolved.
 */
export default function DashboardPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-12 w-full">
      <Suspense fallback={<TimerSkeleton />}>
        <TimerStream />
      </Suspense>

      <Suspense fallback={<SummarySkeleton />}>
        <SummaryStream />
      </Suspense>
    </div>
  );
}
