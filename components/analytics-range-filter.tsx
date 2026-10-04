import Link from "next/link";
import {
  ANALYTICS_RANGES,
  DEFAULT_ANALYTICS_RANGE,
  RANGE_CONTROL_LABELS,
  type AnalyticsRange,
} from "@/lib/analytics-range";
import { cn } from "@/lib/utils";

/**
 * The range selector, as links rather than buttons.
 *
 * The selected range is the URL, and this is why that matters here: the page is a
 * server component whose numbers come from three aggregations scoped to the
 * window, so the selection is not client state that can be flipped after the fact
 * — it is the request. A real `<a>` gives that for free, along with middle-click,
 * the back button, and a link that can be pasted to somebody else, which is the
 * only way to say "look at my year" over a message.
 *
 * The active segment is a raised neutral surface rather than the accent fill the
 * navbar uses. On this app `bg-primary` means one thing only — the timer is
 * running (see `lib/heatmap.ts` on why the heatmap took its green back) — and a
 * filter that lights up in the same colour would spend the app's one saturated
 * signal on a view toggle.
 */
export function AnalyticsRangeFilter({ current }: { current: AnalyticsRange }) {
  return (
    <nav aria-label="Analytics range" className="w-fit">
      <div className="flex items-center gap-0.5 rounded-full border border-border/70 bg-muted/50 p-1">
        {ANALYTICS_RANGES.map((range) => {
          const isActive = range === current;

          return (
            <Link
              key={range}
              // The default range is left out of the query string so `/analytics`
              // stays the canonical URL for the view people land on.
              href={
                range === DEFAULT_ANALYTICS_RANGE
                  ? "/analytics"
                  : `/analytics?range=${range}`
              }
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors sm:px-4",
                isActive
                  ? "bg-background text-foreground shadow-[var(--shadow-card)]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {RANGE_CONTROL_LABELS[range]}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}