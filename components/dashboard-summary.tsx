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
      return "Nothing tracked yet. Ready when you are.";
    }
    if (summary.totalFocusedSeconds >= goalSeconds) {
      return "Daily goal complete. You can stop guilt-free.";
    }
    return `Still ${formatDuration(summary.totalFocusedSeconds)} of real work.`;
  };

  return (
    <div className="space-y-8 w-full">
      {/* Daily Progress Widget */}
      <Card className="border-border/60 shadow-xs bg-card/50">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Today&apos;s Goal
            </CardTitle>
            <div className="text-xl font-bold tracking-tight text-foreground mt-0.5">
              {formatDuration(summary.totalFocusedSeconds)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                / {dailyGoalHours}h goal
              </span>
            </div>
          </div>
          <span className="text-sm font-mono font-medium text-muted-foreground">
            {progressPercent}%
          </span>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={progressPercent} className="h-2" />
          <p className="text-xs text-muted-foreground font-medium">
            {getGoalMessage()}
          </p>
        </CardContent>
      </Card>

      {/* Today's Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/50 bg-card/40 rounded-4xl shadow-xs">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Focused</span>
              <div className="h-7 w-7 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                <Clock className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {formatDuration(summary.totalFocusedSeconds)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/40 rounded-4xl shadow-xs">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Sessions</span>
              <div className="h-7 w-7 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {summary.sessionCount}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/40 rounded-4xl shadow-xs">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Subjects</span>
              <div className="h-7 w-7 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                <BookOpen className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {summary.subjectCount}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/40 rounded-4xl shadow-xs">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Longest</span>
              <div className="h-7 w-7 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <Flame className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {formatDuration(summary.longestSessionSeconds)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Sessions List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold text-foreground tracking-tight">
            Recent Sessions
          </h3>
          {summary.recentSessions.length > 0 && (
            <Link
              href="/sessions"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors font-medium"
            >
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          )}
        </div>

        {summary.recentSessions.length === 0 ? (
          <div className="rounded-4xl border border-dashed border-border/70 p-8 text-center space-y-2 bg-card/20">
            <p className="text-sm font-medium text-foreground">
              Your history is empty.
            </p>
            <p className="text-xs text-muted-foreground">
              Future-you is going to appreciate this page. Start your first session above!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40 rounded-4xl border border-border/60 bg-card/50 overflow-hidden shadow-xs">
            {summary.recentSessions.map((session) => {
              const theme = getSubjectColor(session.subject);
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setSelectedSession(session)}
                  className="w-full text-left p-3.5 sm:px-5 flex items-center justify-between hover:bg-accent/40 transition-colors group"
                >
                  <div className="space-y-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "px-2.5 py-0.5 rounded-full text-xs font-bold border",
                          theme.badge
                        )}
                      >
                        {session.subject}
                      </span>
                      {session.topic && (
                        <>
                          <span className="text-muted-foreground/60 text-xs">·</span>
                          <span className="text-xs text-muted-foreground font-medium truncate">
                            {session.topic}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDateGroup(session.startedAt)}</span>
                      <span>•</span>
                      <span>{formatTime(session.startedAt)}</span>
                      {session.outcome && (
                        <>
                          <span>•</span>
                          <span className="px-2 py-0.5 rounded-full bg-muted text-foreground text-[11px] font-medium border border-border/60">
                            {session.outcome}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="font-mono text-xs font-semibold rounded-full px-3 py-0.5">
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
