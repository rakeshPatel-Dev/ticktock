"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDuration } from "@/lib/timer";
import { getHeatmapLevel, HEATMAP_LEVELS } from "@/lib/heatmap";
import { cn } from "@/lib/utils";
import type { HeatmapMetric } from "@/lib/queries";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Weekday initials for the row labels, Sunday first — matches the column order. */
const ROW_LABELS = ["Sun", "", "Tue", "", "Thu", "", "Sat"];

interface HeatmapViewProps {
  /** Week columns, oldest first, each seven `YYYY-MM-DD` keys Sunday first. */
  columns: string[][];
  metrics: HeatmapMetric[];
  /** The user's current `YYYY-MM-DD`. Anything later has not happened yet. */
  today: string;
  weeks: number;
}

/** `2026-03-04` → `Mar 4`. Reads UTC parts of a UTC-midnight date, so no shift. */
function formatDayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function monthIndexOf(dateKey: string): number {
  return Number(dateKey.slice(5, 7)) - 1;
}

/**
 * A calendar heatmap of focus time, one column per week.
 *
 * The only thing on it is hours focused per day, and the only comparison is
 * against the user's own history. There is no score, no rank, and no
 * cross-user comparison, which is what keeps this descriptive rather than the
 * gamification the PRD rules out (docs/PRD.md §40) — it answers "when do I
 * actually work?", which no other screen in the app can.
 *
 * Two rendering decisions worth stating, because both are the "don't make a
 * shame surface" rule from §14:
 *
 *   1. Days after `today` render fully invisible, not as an empty swatch. A
 *      blank cell means "nothing happened"; an outlined one would read as
 *      "you failed" on every Wednesday until it caught up.
 *   2. There is no streak counter, no "N days in a row", and no summary line
 *      that ranks. Days with focus time are counted, which is a fact.
 */
export function HeatmapView({ columns, metrics, today, weeks }: HeatmapViewProps) {
  // Rows-first Map lookup, so each cell is an O(1) hit rather than a scan of the
  // metric array. Built once per render from a sparse list.
  const byDate = React.useMemo(() => {
    const map = new Map<string, HeatmapMetric>();
    for (const metric of metrics) map.set(metric.date, metric);
    return map;
  }, [metrics]);

  /**
   * Snap the scroller to the most recent week.
   *
   * A year of history is wider than a phone, so the default view has to be the
   * recent end — otherwise the grid opens on 12 months ago, which is the least
   * interesting column on the card.
   *
   * Two things this has to survive, both of which it did not at first:
   *   - Measuring during the first layout pass, where the scroller can still
   *     report no overflow. Assigning `scrollLeft` then is a silent no-op that
   *     leaves the view parked on the oldest week.
   *   - A later resize, which re-creates the overflow. But only while the user
   *     has not scrolled away themselves: a rotation must not yank the view back
   *     from someone who is reading three months back.
   */
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const userScrolled = React.useRef(false);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const snapToEnd = () => {
      if (el.scrollLeft + el.clientWidth < el.scrollWidth - 2) {
        el.scrollLeft = el.scrollWidth;
      }
    };

    const raf = requestAnimationFrame(snapToEnd);

    const onScroll = () => {
      // Only a scroll that leaves us short of the end counts as the user's.
      if (el.scrollLeft + el.clientWidth < el.scrollWidth - 2) {
        userScrolled.current = true;
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    const observer = new ResizeObserver(() => {
      if (!userScrolled.current) snapToEnd();
    });
    observer.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  const activeDays = metrics.length;
  const totalSeconds = React.useMemo(
    () => metrics.reduce((sum, m) => sum + m.durationSeconds, 0),
    [metrics]
  );

  /**
   * One month label per column, but only where there is room. A month shorter
   * than three columns would otherwise print two labels on top of each other,
   * which is what happens in February on a 4-week grid.
   */
  const monthLabels = React.useMemo(() => {
    const labels: (string | null)[] = [];
    let lastLabelColumn = -3;
    let lastMonth = -1;
    for (let w = 0; w < columns.length; w++) {
      const month = monthIndexOf(columns[w][0]);
      if (month !== lastMonth && w - lastLabelColumn >= 3) {
        labels.push(MONTH_LABELS[month]);
        lastLabelColumn = w;
        lastMonth = month;
      } else {
        labels.push(null);
      }
    }
    return labels;
  }, [columns]);

  const gridDescription = `Focus time for the last ${weeks} weeks. ${activeDays} ${
    activeDays === 1 ? "day" : "days"
  } with focus time, ${formatDuration(totalSeconds)} in total.`;

  return (
    <Card>
      <CardHeader className="flex items-baseline justify-between gap-4">
        <div>
          <CardTitle>Focus heatmap</CardTitle>
          <CardDescription>
            {activeDays > 0
              ? `${activeDays} ${activeDays === 1 ? "day" : "days"} with focus time · ${formatDuration(totalSeconds)} total`
              : "Your focus history will appear here once you complete a session."}
          </CardDescription>
        </div>
        <span className="shrink-0 text-[12px] text-muted-foreground">
          Last {weeks} weeks
        </span>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex gap-2">
          {/* Row labels. Fixed width so the grid does not shift on mount. */}
          <div
            aria-hidden
            className="grid grid-rows-7 gap-1 shrink-0 pt-5 text-[10px] font-medium text-muted-foreground/70"
          >
            {ROW_LABELS.map((label, i) => (
              <span key={i} className="h-3 leading-3 w-6">
                {label}
              </span>
            ))}
          </div>

          <div ref={scrollRef} className="overflow-x-auto pb-1 -mb-1 flex-1 min-w-0">
            {/*
              `minmax(12px, 1fr)`, NOT `minmax(0, 1fr)`. With a 0 minimum the
              tracks are free to shrink below the cells they hold, so on a phone
              the grid compressed to a few pixels per column, the 12px cells
              overlapped each other, and the scroller reported almost no overflow
              — which also meant there was nothing to scroll to. A 12px floor
              makes the grid honestly wider than the screen, so it scrolls.

              The `w-fit mx-auto` wrapper centres it when there is slack and
              collapses the margin to 0 when there is not, which is what lets the
              same markup centre on desktop and scroll on mobile.
            */}
            <div className="w-fit mx-auto">
              {/* Month labels. Same track count and size as the grid below, so a
                  label always sits over the week it names. */}
              <div
                aria-hidden
                className="grid grid-rows-1 gap-1 mb-2 h-4"
                style={{
                  gridTemplateColumns: `repeat(${columns.length}, minmax(12px, 1fr))`,
                }}
              >
                {monthLabels.map((label, i) => (
                  <span
                    key={i}
                    className="text-[10px] font-medium text-muted-foreground/80 whitespace-nowrap"
                  >
                    {label}
                  </span>
                ))}
              </div>

              {/*
                role="img" collapses 364 cells into one spoken sentence. Each cell
                carries a native `title` for pointer users, which a tooltip library
                would mean 364 mounted roots for a grid nobody hovers cell-by-cell.
              */}
              <div
                role="img"
                aria-label={gridDescription}
                className="grid grid-flow-col grid-rows-7 gap-1"
                style={{
                  gridTemplateColumns: `repeat(${columns.length}, minmax(12px, 1fr))`,
                }}
              >
              {columns.flatMap((week) =>
                week.map((dateKey) => {
                  const metric = byDate.get(dateKey);
                  const isFuture = dateKey > today;
                  const isToday = dateKey === today;
                  const level = metric ? getHeatmapLevel(metric.durationSeconds) : 0;

                  if (isFuture) {
                    // Occupies its cell so the grid stays square, but invisible.
                    return <div key={dateKey} className="h-3 aspect-square" aria-hidden />;
                  }

                  const swatch = HEATMAP_LEVELS[level];
                  const title = metric
                    ? `${formatDayLabel(dateKey)}: ${formatDuration(metric.durationSeconds)} focused across ${metric.sessionCount} ${
                        metric.sessionCount === 1 ? "session" : "sessions"
                      }`
                    : `${formatDayLabel(dateKey)}: no focus time recorded`;

                  return (
                    <div
                      key={dateKey}
                      title={title}
                      className={cn(
                        // relative + hover:z-10 so the scale-up renders over its
                        // neighbours instead of under them, which is what a
                        // 12px cell in a 16px track does otherwise.
                        "relative h-3 aspect-square rounded-[3px] transition-transform hover:z-10 hover:scale-125",
                        swatch.className,
                        isToday &&
                          "ring-1 ring-foreground/60 ring-offset-1 ring-offset-background"
                      )}
                    />
                  );
                })
              )}
              </div>
            </div>
          </div>
        </div>

        {/* Legend. Every swatch is named with the range it stands for, so the
            shading is readable rather than decorative. */}
        <div className="flex items-center justify-end gap-1.5 text-[10px] font-medium text-muted-foreground/80">
          <span className="mr-1">Less</span>
          {HEATMAP_LEVELS.map((level) => (
            <span key={level.level} className="flex items-center gap-1">
              <span
                aria-hidden
                className={cn("h-3 w-3 rounded-[3px]", level.className)}
              />
              <span className="hidden sm:inline">{level.legend}</span>
            </span>
          ))}
          <span className="ml-1">More</span>
        </div>
      </CardContent>
    </Card>
  );
}
