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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <Card className="border-border/60 bg-card/40 rounded-4xl shadow-xs">
          <CardContent className="p-5 sm:p-6 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground">This Week</span>
              <div className="h-9 w-9 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center ring-1 ring-sky-500/20 shadow-sm shadow-sky-500/20">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <p className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
              {formatDuration(totalWeeklySeconds)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40 rounded-4xl shadow-xs">
          <CardContent className="p-5 sm:p-6 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground">Sessions</span>
              <div className="h-9 w-9 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center ring-1 ring-emerald-500/20 shadow-sm shadow-emerald-500/20">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <p className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
              {totalWeeklySessions}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40 rounded-4xl shadow-xs">
          <CardContent className="p-5 sm:p-6 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground">Average</span>
              <div className="h-9 w-9 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center ring-1 ring-orange-500/20 shadow-sm shadow-orange-500/20">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <p className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
              {formatDuration(avgSessionSeconds)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40 rounded-4xl shadow-xs">
          <CardContent className="p-5 sm:p-6 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground">Longest Day</span>
              <div className="h-9 w-9 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center ring-1 ring-rose-500/20 shadow-sm shadow-rose-500/20">
                <Calendar className="h-4 w-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black tracking-tight text-foreground truncate">
              {longestDayLabel || "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Activity Bar Chart */}
      <Card className="border-border/60 bg-card/50 shadow-xs rounded-4xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg sm:text-xl font-bold flex items-center justify-between">
            <span>Daily Activity (This Week)</span>
            <span className="text-xs sm:text-sm font-semibold text-muted-foreground">
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
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 px-3 py-1 bg-foreground text-background text-xs font-mono font-semibold rounded-full shadow-md pointer-events-none whitespace-nowrap z-10">
                    {formatDuration(day.durationSeconds)} ({day.sessionCount} sessions)
                  </div>

                  <div className="w-full bg-muted/40 rounded-t-xl h-full flex items-end overflow-hidden">
                    <div
                      style={{ height: `${day.durationSeconds > 0 ? heightPercent : 0}%` }}
                      className="w-full bg-sky-500 hover:bg-sky-400 transition-all duration-300 rounded-t-xl"
                    />
                  </div>

                  <div className="space-y-0.5 text-center">
                    <span className="text-xs sm:text-sm font-bold text-foreground">
                      {day.dayLabel}
                    </span>
                    <p className="text-xs font-mono text-muted-foreground font-semibold">
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
            <CardTitle className="text-lg sm:text-xl font-bold flex items-center gap-2.5">
              <BookOpen className="h-5 w-5 text-sky-500" />
              Time by Subject
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {subjectMetrics.length === 0 ? (
              <p className="text-sm sm:text-base text-muted-foreground py-8 text-center">
                Nothing tracked yet this week. Complete a session to see your subject breakdown!
              </p>
            ) : (
              subjectMetrics.map((item) => {
                const theme = getSubjectColor(item.subject);
                return (
                  <div key={item.subject} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2.5">
                        <span className={cn("h-3 w-3 rounded-full", theme.dot)} />
                        <span className="font-bold text-foreground">
                          {item.subject}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground font-mono font-semibold text-xs sm:text-sm">
                        <span>{formatDuration(item.durationSeconds)}</span>
                        <span className="text-xs text-muted-foreground/70">
                          ({item.percentage}%)
                        </span>
                      </div>
                    </div>
                    <Progress
                      value={item.percentage}
                      indicatorClassName={theme.dot}
                      className="h-2.5"
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
            <CardTitle className="text-lg sm:text-xl font-bold flex items-center gap-2.5">
              <Layers className="h-5 w-5 text-orange-500" />
              Time by Topic
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topicMetrics.length === 0 ? (
              <p className="text-sm sm:text-base text-muted-foreground py-8 text-center">
                No topic breakdown available yet. Add topics when starting a session to see detailed insights!
              </p>
            ) : (
              <div className="space-y-2.5">
                {topicMetrics.slice(0, 8).map((t) => (
                  <div
                    key={`${t.subject}-${t.topic}`}
                    className="flex items-center justify-between p-3 px-4.5 rounded-full bg-muted/40 border border-border/40 hover:bg-muted/60 transition-colors"
                  >
                    <div>
                      <span className="font-bold text-sm sm:text-base text-foreground">
                        {t.topic}
                      </span>
                      <span className="text-muted-foreground text-xs sm:text-sm font-medium block">
                        {t.subject}
                      </span>
                    </div>
                    <Badge variant="secondary" className="font-mono text-xs sm:text-sm font-bold rounded-full px-3.5 py-1">
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
