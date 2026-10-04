"use client";

import * as React from "react";
import { formatDuration } from "@/lib/timer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { HeatmapView } from "@/components/heatmap-view";
import {
  labelStride,
  RANGE_PROSE,
  type AnalyticsRange,
  type Bar,
} from "@/lib/analytics-range";
import { cn } from "@/lib/utils";
import type {
  HeatmapMetric,
  SubjectMetric,
  TopicMetric,
} from "@/lib/queries";

/** Rows shown before the subject panel admits there are more. */
const SUBJECT_PREVIEW_LIMIT = 8;

/**
 * The smallest stride at which the printed labels fit across the chart.
 *
 * Reads the labels back off the DOM instead of predicting them, because every
 * input is layout-dependent: the label's own width ("Sun" against "Nov '25"),
 * the bar pitch (which the `gap-*` classes above also consume), and the
 * container width. A stride computed from any one of those in isolation is right
 * until the range changes, and then the axis overlaps or empties out.
 *
 * Collision is the criterion rather than "one label per N bars": the count of
 * printed labels times the widest label must not exceed the space available. That
 * makes it correct for 7 weekday labels on a phone and for 12 month labels on a
 * laptop without either being special-cased.
 */
function fitLabelStride(chart: HTMLElement): number {
  const bars = Array.from(chart.children) as HTMLElement[];
  if (bars.length === 0) return 1;

  const available = chart.clientWidth;
  if (available <= 0) return 1;

  let widest = 0;
  for (const bar of bars) {
    const label = bar.querySelector("span");
    if (!label?.textContent?.trim()) continue;
    widest = Math.max(widest, label.getBoundingClientRect().width);
  }
  if (widest <= 0) return 1;

  // Never thinner than the count-based guess: if the labels already fit, this is a
  // no-op, and it stops a very wide container from printing every one of 60.
  return Math.max(1, Math.ceil((widest * bars.length) / available), labelStride(bars.length));
}

interface AnalyticsViewProps {
  /** One bar per bucket, oldest first. Length varies with the range. */
  bars: Bar[];
  /** Short caption of the window. "Sun – Sat", "Oct 2025 – Sep 2026". */
  axisCaption: string;
  /** The selected window. Every string below reads its prose from here. */
  range: AnalyticsRange;
  subjectMetrics: SubjectMetric[];
  topicMetrics: TopicMetric[];
  totalSeconds: number;
  totalSessions: number;
  avgSessionSeconds: number;
  longestDayLabel: string;
  /** Week columns for the heatmap, oldest first. Year range, not the range above. */
  heatmapColumns: string[][];
  heatmapMetrics: HeatmapMetric[];
  /** The user's current `YYYY-MM-DD`; cells after this render as future. */
  heatmapToday: string;
  heatmapWeeks: number;
}

export function AnalyticsView({
  bars,
  axisCaption,
  range,
  subjectMetrics,
  topicMetrics,
  totalSeconds,
  totalSessions,
  avgSessionSeconds,
  longestDayLabel,
  heatmapColumns,
  heatmapMetrics,
  heatmapToday,
  heatmapWeeks,
}: AnalyticsViewProps) {
  // Max duration across the bars, for the chart's scale.
  const maxBarSeconds = Math.max(
    ...bars.map((bar) => bar.durationSeconds),
    3600 // minimum 1 hour baseline so empty or small days look balanced
  );

  // How many bars to skip between printed labels.
  //
  // The count alone is not enough, and getting this wrong is not a cosmetic
  // problem: a stride derived only from bar count labels all twelve months of an
  // all-time axis, and on a phone each bar is ~22px against a ~42px "Nov '25".
  // Those labels cannot sit side by side, so they wrap, and the axis quietly
  // grows to two lines and reads as a different chart.
  //
  // So the count sets the starting guess — enough that a wide viewport is right
  // on the first paint, with no measuring flash — and `fitLabelStride` then
  // measures what is actually on screen and widens the stride until the printed
  // labels fit. That handles bar count, label length, font size and viewport in
  // one step, none of which a breakpoint in the view can know about.
  const [stride, setStride] = React.useState(() => labelStride(bars.length));
  const chartRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const measure = () => setStride(fitLabelStride(el));
    measure();
    // Width only. Re-running on height would fight the bars' own animation.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [bars.length]);

  const extraSubjects = Math.max(0, subjectMetrics.length - SUBJECT_PREVIEW_LIMIT);
  const visibleSubjects = subjectMetrics.slice(0, SUBJECT_PREVIEW_LIMIT);

  // Read straight off the range rather than interpolated from its label, because
  // "All time" is the one case where the label does not fit the sentence.
  const prose = RANGE_PROSE[range];

  // The same divided strip the dashboard uses, for the same reason: these are
  // four figures, not four cards. They each had a differently coloured icon
  // circle before, which made a spec sheet look like a dashboard.
  const stats = [
    { label: prose.label, value: formatDuration(totalSeconds) },
    { label: "Sessions", value: String(totalSessions) },
    { label: "Avg session", value: formatDuration(avgSessionSeconds) },
    { label: "Longest day", value: longestDayLabel || "—" },
  ];

  /**
   * Gap and corner radius that suit the bar count.
   *
   * `gap-2 sm:gap-4` across 60 bars spends 240px on gaps alone and leaves each
   * bar four pixels wide, and a 6px radius on a 4px bar is a blob rather than a
   * bar. Both step down together so the chart stays a row of bars instead of a
   * row of slivers.
   */
  const barGeometry = (() => {
    if (bars.length <= 8) return { gap: "gap-3 sm:gap-5", radius: "rounded-t-md" };
    if (bars.length <= 14) return { gap: "gap-2 sm:gap-3", radius: "rounded-t-md" };
    if (bars.length <= 30) return { gap: "gap-1 sm:gap-2", radius: "rounded-t-sm" };
    return { gap: "gap-0.5 sm:gap-1", radius: "rounded-t-sm" };
  })();

  return (
    <div className="space-y-4 pb-4">
      <Card>
        <CardContent className="flex">
          <dl className="grid w-full grid-cols-2 gap-y-5 sm:grid-cols-4 sm:gap-y-0 [&>*]:min-w-0">
            {stats.map((stat, i) => (
              <div
                key={stat.label}
                className={cn(
                  "min-w-0",
                  // Two-up on phones, four-up from `sm`. The rule follows the
                  // wrap: a hairline on the left of every cell but the one that
                  // starts a row — odd indices on phones, everything but the
                  // first on wider screens.
                  i % 2 === 1 && "border-l border-border pl-5",
                  i > 0 && "sm:border-l sm:border-border sm:pl-5"
                )}
              >
                <dt className="type-label">{stat.label}</dt>
                <dd
                  className={cn(
                    "type-metric mt-1.5 text-[22px]",
                    stat.label === "Longest day" && "truncate text-[17px]"
                  )}
                >
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-baseline justify-between gap-4">
          <CardTitle>Daily activity</CardTitle>
          <span className="shrink-0 text-[12px] text-muted-foreground">
            {axisCaption}
          </span>
        </CardHeader>
        <CardContent>
          <div ref={chartRef} className={cn("flex h-44 items-end", barGeometry.gap)}>
            {bars.map((bar, i) => {
              const heightPercent =
                maxBarSeconds > 0
                  ? Math.max(4, Math.round((bar.durationSeconds / maxBarSeconds) * 100))
                  : 4;

              return (
                <div
                  key={bar.key}
                  // `min-w-0` is what lets the bar shrink below its own label. A
                  // flex item defaults to `min-width: auto`, which floors it at the
                  // label's min-content width — so a nowrap "Nov '25" held every bar
                  // to 42px and the row overflowed its card by 80px on a phone.
                  // Labels overflow the bar box on purpose at that size; the stride
                  // above is what keeps them from touching each other.
                  className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-2"
                >
                  <div className="relative flex h-full items-end">
                    {/* Value on hover, as a quiet label rather than a bubble
                        that pops in with a shadow. */}
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] font-medium text-popover-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                      {formatDuration(bar.durationSeconds)}
                    </div>
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={cn(
                        "w-full bg-primary/85 transition-colors",
                        barGeometry.radius,
                        bar.durationSeconds > 0
                          ? "group-hover:bg-primary"
                          : "bg-muted"
                      )}
                    />
                  </div>

                  {/* `self-center` + `whitespace-nowrap` are load-bearing, not
                      tidying. As a stretched flex item the span's box is the bar's
                      width, so measuring it would report 22px for a 42px "Nov '25"
                      and conclude the labels fit; and without `nowrap` the text
                      wraps to two lines instead of colliding, which hides the
                      problem while making the axis taller. An empty string rather
                      than a hidden span keeps every bar the same width. */}
                  <span className="self-center whitespace-nowrap text-center text-[11px] text-muted-foreground">
                    {i % stride === 0 ? bar.label : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/*
        The heatmap sits between the chart and the two panels, and it is
        deliberately NOT in the range the rest of this page uses — it is a year.
        Its own header says "Last 52 weeks" so it cannot be misread as part of
        the numbers above it. Reusing the selected range here would be the exact
        bug ISSUES.md #2 documents, in a new place.
      */}
      <HeatmapView
        columns={heatmapColumns}
        metrics={heatmapMetrics}
        today={heatmapToday}
        weeks={heatmapWeeks}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By subject</CardTitle>
            <CardDescription>
              {prose.label}, by share of focused time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {subjectMetrics.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-muted-foreground">
                Nothing tracked {prose.tracked}.
              </p>
            ) : (
              <>
                <dl className="space-y-4">
                  {visibleSubjects.map((item) => (
                    <div key={item.subject} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="truncate text-[13px] font-medium text-foreground">
                          {item.subject}
                        </dt>
                        <dd className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">
                          {formatDuration(item.durationSeconds)}
                          <span className="ml-1.5 text-muted-foreground/70">
                            {item.percentage}%
                          </span>
                        </dd>
                      </div>
                      {/* One series, so one colour. The subject is named on the
                          row; the bar only has to show magnitude. */}
                      <Progress value={item.percentage} className="h-1" />
                    </div>
                  ))}
                </dl>
                {extraSubjects > 0 && (
                  <p className="mt-4 text-[12px] text-muted-foreground">
                    +{extraSubjects} more{" "}
                    {extraSubjects === 1 ? "subject" : "subjects"}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By topic</CardTitle>
            <CardDescription>Your longest topics {prose.of}.</CardDescription>
          </CardHeader>
          <CardContent>
            {topicMetrics.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-muted-foreground">
                No topics recorded {prose.of}. Add one when starting a session.
              </p>
            ) : (
              <ul className="divide-y divide-border/70">
                {topicMetrics.slice(0, SUBJECT_PREVIEW_LIMIT).map((t) => (
                  <li
                    key={`${t.subject}-${t.topic}`}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {t.topic}
                      </p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {t.subject}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[12px] tabular-nums text-secondary-foreground">
                      {formatDuration(t.durationSeconds)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
