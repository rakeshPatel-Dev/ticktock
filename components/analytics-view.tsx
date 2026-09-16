"use client";

import * as React from "react";
import { Clock, CheckCircle2, TrendingUp, Calendar, BookOpen, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/timer";
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
        <Card className="border-border/60 bg-card/40">
          <CardContent className="p-4 space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> This Week
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {formatDuration(totalWeeklySeconds)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40">
          <CardContent className="p-4 space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Sessions
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {totalWeeklySessions}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40">
          <CardContent className="p-4 space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Average Session
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {formatDuration(avgSessionSeconds)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40">
          <CardContent className="p-4 space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Longest Day
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground truncate">
              {longestDayLabel || "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Activity Bar Chart */}
      <Card className="border-border/60 bg-card/50 shadow-2xs">
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
                  ? Math.max(6, Math.round((day.durationSeconds / maxDaySeconds) * 100))
                  : 6;

              return (
                <div
                  key={day.date}
                  className="flex flex-col items-center gap-2 h-full justify-end group relative"
                >
                  {/* Tooltip on hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 px-2 py-1 bg-foreground text-background text-[10px] font-mono rounded shadow pointer-events-none whitespace-nowrap z-10">
                    {formatDuration(day.durationSeconds)} ({day.sessionCount} sessions)
                  </div>

                  <div className="w-full bg-muted/40 rounded-t-sm h-full flex items-end overflow-hidden">
                    <div
                      style={{ height: `${day.durationSeconds > 0 ? heightPercent : 0}%` }}
                      className="w-full bg-primary/80 hover:bg-primary transition-all duration-300 rounded-t-sm"
                    />
                  </div>

                  <div className="space-y-0.5 text-center">
                    <span className="text-xs font-semibold text-foreground">
                      {day.dayLabel}
                    </span>
                    <p className="text-[10px] font-mono text-muted-foreground">
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
        <Card className="border-border/60 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              Time by Subject
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {subjectMetrics.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Nothing tracked yet. Ready when you are.
              </p>
            ) : (
              subjectMetrics.map((item) => (
                <div key={item.subject} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">
                      {item.subject}
                    </span>
                    <div className="flex items-center gap-2 text-muted-foreground font-mono">
                      <span>{formatDuration(item.durationSeconds)}</span>
                      <span className="text-[11px] text-muted-foreground/70">
                        ({item.percentage}%)
                      </span>
                    </div>
                  </div>
                  <Progress value={item.percentage} className="h-1.5" />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Time by Topic */}
        <Card className="border-border/60 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              Time by Topic
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topicMetrics.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No topic breakdown available yet. Add topics to your study sessions to see details here!
              </p>
            ) : (
              <div className="space-y-2.5">
                {topicMetrics.slice(0, 8).map((t) => (
                  <div
                    key={`${t.subject}-${t.topic}`}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/40 text-xs"
                  >
                    <div>
                      <span className="font-medium text-foreground">
                        {t.topic}
                      </span>
                      <span className="text-muted-foreground text-[11px] block">
                        {t.subject}
                      </span>
                    </div>
                    <Badge variant="secondary" className="font-mono text-xs font-medium">
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
