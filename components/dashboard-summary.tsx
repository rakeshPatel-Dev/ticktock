"use client";

import * as React from "react";
import Link from "next/link";
import { Clock, CheckCircle, BookOpen, Flame, ChevronRight } from "lucide-react";
import { type DashboardSummary } from "@/lib/queries";
import { type StudySession } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { formatDuration, formatTime, formatDateGroup } from "@/lib/timer";
import { getSubjectColor } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { SessionDetailModal } from "./session-detail-modal";

interface DashboardSummaryProps {
  summary: DashboardSummary;
  dailyGoalHours?: number;
}

export function DashboardSummaryView({
  summary,
  dailyGoalHours = 4,
}: DashboardSummaryProps) {
  const [selectedSession, setSelectedSession] = React.useState<StudySession | null>(null);

  const goalSeconds = dailyGoalHours * 3600;
  const progressPercent = Math.min(
    100,
    Math.round((summary.totalFocusedSeconds / goalSeconds) * 100)
  );

  // Thoughtful non-punitive messaging
  const getGoalMessage = () => {
    if (summary.totalFocusedSeconds === 0) {
      return "Nothing tracked yet today. Ready whenever you are.";
    }
    if (summary.totalFocusedSeconds >= goalSeconds) {
      return "Daily focus goal reached! Outstanding work today.";
    }
    return `${formatDuration(summary.totalFocusedSeconds)} focused today. Every session builds momentum!`;
  };

  return (
    <div className="space-y-8 w-full">
      {/* Daily Progress Widget */}
      <Card className="border-border/40 [box-shadow:var(--shadow-card),inset_0_1px_0_oklch(1_0_0_/_0.6)]">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Today&apos;s Goal
            </CardTitle>
            <div className="text-3xl sm:text-4xl font-black tracking-tight text-foreground mt-1">
              {formatDuration(summary.totalFocusedSeconds)}{" "}
              <span className="text-base sm:text-lg font-medium text-muted-foreground ml-2">
                / {dailyGoalHours}h goal
              </span>
            </div>
          </div>
          <span className="text-base sm:text-lg font-mono font-bold text-foreground">
            {progressPercent}%
          </span>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <Progress value={progressPercent} className="h-2.5" />
          <p className="text-sm text-muted-foreground font-medium">
            {getGoalMessage()}
          </p>
        </CardContent>
      </Card>

      {/* Today's Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <Card className="border-border/40">
          <CardContent className="p-5 sm:p-6 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground">Focused</span>
              <div className="h-9 w-9 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center ring-1 ring-sky-500/20 shadow-sm shadow-sky-500/20">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <p className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
              {formatDuration(summary.totalFocusedSeconds)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardContent className="p-5 sm:p-6 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground">Sessions</span>
              <div className="h-9 w-9 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center ring-1 ring-emerald-500/20 shadow-sm shadow-emerald-500/20">
                <CheckCircle className="h-4 w-4" />
              </div>
            </div>
            <p className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
              {summary.sessionCount}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardContent className="p-5 sm:p-6 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground">Subjects</span>
              <div className="h-9 w-9 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center ring-1 ring-orange-500/20 shadow-sm shadow-orange-500/20">
                <BookOpen className="h-4 w-4" />
              </div>
            </div>
            <p className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
              {summary.subjectCount}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardContent className="p-5 sm:p-6 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground">Longest</span>
              <div className="h-9 w-9 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center ring-1 ring-rose-500/20 shadow-sm shadow-rose-500/20">
                <Flame className="h-4 w-4" />
              </div>
            </div>
            <p className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
              {formatDuration(summary.longestSessionSeconds)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Sessions List */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
            Recent Sessions
          </h3>
          {summary.recentSessions.length > 0 && (
            <Link
              href="/sessions"
              className="text-sm font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
            >
              View all <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>

        {summary.recentSessions.length === 0 ? (
          <div className="rounded-4xl border border-dashed border-border/70 p-10 text-center space-y-2.5 bg-card/20">
            <p className="text-lg font-bold text-foreground">
              No sessions tracked yet today.
            </p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Start your first session above to begin your daily focus log!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40 rounded-4xl border border-border/50 bg-card overflow-hidden [box-shadow:var(--shadow-card)]">
            {summary.recentSessions.map((session) => {
              const theme = getSubjectColor(session.subject);
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setSelectedSession(session)}
                  className="w-full text-left p-4 sm:px-6 flex items-center justify-between hover:bg-accent/40 transition-all group border-l-2 border-transparent hover:border-sky-400/60"
                >
                  <div className="space-y-1.5 min-w-0 pr-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "px-3 py-0.5 rounded-full text-xs font-bold border shadow-2xs",
                          theme.badge
                        )}
                      >
                        {session.subject}
                      </span>
                      {session.topic && (
                        <>
                          <span className="text-muted-foreground/50 text-xs">·</span>
                          <span className="text-sm sm:text-base font-semibold text-foreground truncate">
                            {session.topic}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground font-medium">
                      <span>{formatDateGroup(session.startedAt)}</span>
                      <span>•</span>
                      <span>{formatTime(session.startedAt)}</span>
                      {session.outcome && (
                        <>
                          <span>•</span>
                          <span className="px-2.5 py-0.5 rounded-full bg-muted text-foreground text-xs font-semibold border border-border/60">
                            {session.outcome}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <Badge variant="secondary" className="font-mono text-sm font-bold rounded-full px-3.5 py-1">
                      {formatDuration(session.durationSeconds)}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail modal for clicking a session */}
      <SessionDetailModal
        session={selectedSession}
        open={!!selectedSession}
        onOpenChange={(open) => !open && setSelectedSession(null)}
      />
    </div>
  );
}
