"use client";

import * as React from "react";
import { Clock, CheckCircle2, TrendingUp, Calendar, BookOpen, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/timer";
import { getSubjectColor } from "@/lib/colors";
import { cn } from "@/lib/utils";
import type { DailyMetric, SubjectMetric, TopicMetric } from "@/lib/queries";

interface AnalyticsViewProps {
  dailyMetrics: DailyMetric[];
  subjectMetrics: SubjectMetric[];
  topicMetrics: TopicMetric[];
  totalWeeklySeconds: number;
  totalWeeklySessions: number;
  avgSessionSeconds: number;
  longestDayLabel: string;
}

export function AnalyticsView({
  dailyMetrics,
  subjectMetrics,
  topicMetrics,
  totalWeeklySeconds,
  totalWeeklySessions,
  avgSessionSeconds,
  longestDayLabel,
}: AnalyticsViewProps) {
  // Max duration in dailyMetrics for chart scale
  const maxDaySeconds = Math.max(
    ...dailyMetrics.map((d) => d.durationSeconds),
    3600 // minimum 1 hour baseline so empty or small days look balanced
  );


  return (
    <div className="space-y-8 pb-12">
      {/* Top 4 Insight Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/60 bg-card/40 rounded-4xl shadow-xs">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">This Week</span>
              <div className="h-7 w-7 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                <Clock className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {formatDuration(totalWeeklySeconds)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40 rounded-4xl shadow-xs">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Sessions</span>
              <div className="h-7 w-7 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {totalWeeklySessions}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40 rounded-4xl shadow-xs">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Average Session</span>
              <div className="h-7 w-7 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                <TrendingUp className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {formatDuration(avgSessionSeconds)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40 rounded-4xl shadow-xs">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Longest Day</span>
              <div className="h-7 w-7 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <Calendar className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight text-foreground truncate">
              {longestDayLabel || "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Activity Bar Chart */}
      <Card className="border-border/60 bg-card/50 shadow-xs rounded-4xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span>Daily Activity (This Week)</span>
            <span className="text-xs font-normal text-muted-foreground">
              Mon – Sun
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end pt-6 pb-2 h-44 border-b border-border/40">
            {dailyMetrics.map((day) => {
              const heightPercent =
                maxDaySeconds > 0
                  ? Math.max(8, Math.round((day.durationSeconds / maxDaySeconds) * 100))
                  : 8;

              return (
                <div
                  key={day.date}
                  className="flex flex-col items-center gap-2 h-full justify-end group relative"
                >
                  {/* Tooltip on hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 px-3 py-1 bg-foreground text-background text-[11px] font-mono font-medium rounded-full shadow-md pointer-events-none whitespace-nowrap z-10">
                    {formatDuration(day.durationSeconds)} ({day.sessionCount} sessions)
                  </div>

                  <div className="w-full bg-muted/40 rounded-t-xl h-full flex items-end overflow-hidden">
                    <div
                      style={{ height: `${day.durationSeconds > 0 ? heightPercent : 0}%` }}
                      className="w-full bg-sky-500 hover:bg-sky-400 transition-all duration-300 rounded-t-xl"
                    />
                  </div>

                  <div className="space-y-0.5 text-center">
                    <span className="text-xs font-semibold text-foreground">
                      {day.dayLabel}
                    </span>
                    <p className="text-[10px] font-mono text-muted-foreground font-medium">
                      {day.durationSeconds > 0 ? formatDuration(day.durationSeconds) : "0m"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Time By Subject & Time By Topic */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Time by Subject */}
        <Card className="border-border/60 bg-card/50 rounded-4xl shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-sky-500" />
              Time by Subject
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {subjectMetrics.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Nothing tracked yet. Ready when you are.
              </p>
            ) : (
              subjectMetrics.map((item) => {
                const theme = getSubjectColor(item.subject);
                return (
                  <div key={item.subject} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-2.5 w-2.5 rounded-full", theme.dot)} />
                        <span className="font-semibold text-foreground">
                          {item.subject}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground font-mono">
                        <span>{formatDuration(item.durationSeconds)}</span>
                        <span className="text-[11px] text-muted-foreground/70">
                          ({item.percentage}%)
                        </span>
                      </div>
                    </div>
                    <Progress
                      value={item.percentage}
                      indicatorClassName={theme.dot}
                      className="h-2"
                    />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Time by Topic */}
        <Card className="border-border/60 bg-card/50 rounded-4xl shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-orange-500" />
              Time by Topic
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topicMetrics.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No topic breakdown available yet. Add topics to your study sessions to see details here!
              </p>
            ) : (
              <div className="space-y-2">
                {topicMetrics.slice(0, 8).map((t) => (
                  <div
                    key={`${t.subject}-${t.topic}`}
                    className="flex items-center justify-between p-2.5 px-4 rounded-full bg-muted/40 border border-border/40 text-xs hover:bg-muted/60 transition-colors"
                  >
                    <div>
                      <span className="font-semibold text-foreground">
                        {t.topic}
                      </span>
                      <span className="text-muted-foreground text-[11px] block">
                        {t.subject}
                      </span>
                    </div>
                    <Badge variant="secondary" className="font-mono text-xs font-semibold rounded-full px-3 py-0.5">
                      {formatDuration(t.durationSeconds)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
