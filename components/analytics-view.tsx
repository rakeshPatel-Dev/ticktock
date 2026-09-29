"use client";

import * as React from "react";
import { formatDuration } from "@/lib/timer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { HeatmapView } from "@/components/heatmap-view";
import { cn } from "@/lib/utils";
import type {
  DailyMetric,
  HeatmapMetric,
  SubjectMetric,
  TopicMetric,
} from "@/lib/queries";

interface AnalyticsViewProps {
  dailyMetrics: DailyMetric[];
  subjectMetrics: SubjectMetric[];
  topicMetrics: TopicMetric[];
  totalWeeklySeconds: number;
  totalWeeklySessions: number;
  avgSessionSeconds: number;
  longestDayLabel: string;
  /** Week columns for the heatmap, oldest first. Year range, not week range. */
  heatmapColumns: string[][];
  heatmapMetrics: HeatmapMetric[];
  /** The user's current `YYYY-MM-DD`; cells after it render as future. */
  heatmapToday: string;
  heatmapWeeks: number;
}

export function AnalyticsView({
  dailyMetrics,
  subjectMetrics,
  topicMetrics,
  totalWeeklySeconds,
  totalWeeklySessions,
  avgSessionSeconds,
  longestDayLabel,
  heatmapColumns,
  heatmapMetrics,
  heatmapToday,
  heatmapWeeks,
}: AnalyticsViewProps) {
  // Max duration in dailyMetrics for chart scale
  const maxDaySeconds = Math.max(
    ...dailyMetrics.map((d) => d.durationSeconds),
    3600 // minimum 1 hour baseline so empty or small days look balanced
  );

  // The same divided strip the dashboard uses, for the same reason: these are
  // four figures, not four cards. They each had a differently coloured icon
  // circle before, which made a spec sheet look like a dashboard.
  const stats = [
    { label: "This week", value: formatDuration(totalWeeklySeconds) },
    { label: "Sessions", value: String(totalWeeklySessions) },
    { label: "Avg session", value: formatDuration(avgSessionSeconds) },
    { label: "Longest day", value: longestDayLabel || "—" },
  ];

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
          <span className="text-[12px] text-muted-foreground">Mon – Sun</span>
        </CardHeader>
        <CardContent>
          <div className="flex h-44 items-end gap-2 sm:gap-4">
            {dailyMetrics.map((day) => {
              const heightPercent =
                maxDaySeconds > 0
                  ? Math.max(4, Math.round((day.durationSeconds / maxDaySeconds) * 100))
                  : 4;

              return (
                <div
                  key={day.date}
                  className="group flex h-full flex-1 flex-col justify-end gap-2"
                >
                  <div className="relative flex h-full items-end">
                    {/* Value on hover, as a quiet label rather than a bubble
                        that pops in with a shadow. */}
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] font-medium text-popover-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                      {formatDuration(day.durationSeconds)}
                    </div>
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={cn(
                        "w-full rounded-t-md bg-primary/85 transition-colors",
                        day.durationSeconds > 0
                          ? "group-hover:bg-primary"
                          : "bg-muted"
                      )}
                    />
                  </div>

                  <span className="text-center text-[11px] text-muted-foreground">
                    {day.dayLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/*
        The heatmap sits between the week chart and the two panels, and it is
        deliberately NOT in the week range the rest of this page uses — it is a
        year. Its own header says "Last 52 weeks" so it cannot be misread as
        part of the "This Week" numbers above it. Reusing `range` here would be
        the exact bug ISSUES.md #2 documents, in a new place.
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
            <CardDescription>This week, by share of focused time.</CardDescription>
          </CardHeader>
          <CardContent>
            {subjectMetrics.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-muted-foreground">
                Nothing tracked this week yet.
              </p>
            ) : (
              <dl className="space-y-4">
                {subjectMetrics.map((item) => (
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
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By topic</CardTitle>
            <CardDescription>Your longest sessions this week.</CardDescription>
          </CardHeader>
          <CardContent>
            {topicMetrics.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-muted-foreground">
                No topics recorded this week. Add one when starting a session.
              </p>
            ) : (
              <ul className="divide-y divide-border/70">
                {topicMetrics.slice(0, 8).map((t) => (
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
