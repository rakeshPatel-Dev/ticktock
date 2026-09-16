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
        <Card className="border-border/50 bg-card/40">
          <CardContent className="p-4 space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> Focused
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {formatDuration(summary.totalFocusedSeconds)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/40">
          <CardContent className="p-4 space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5" /> Sessions
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {summary.sessionCount}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/40">
          <CardContent className="p-4 space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" /> Subjects
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {summary.subjectCount}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/40">
          <CardContent className="p-4 space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Flame className="h-3.5 w-3.5" /> Longest
            </span>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {formatDuration(summary.longestSessionSeconds)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Sessions List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground tracking-tight">
            Recent Sessions
          </h3>
          {summary.recentSessions.length > 0 && (
            <Link
              href="/sessions"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          )}
        </div>

        {summary.recentSessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 p-8 text-center space-y-2">
            <p className="text-sm font-medium text-foreground">
              Your history is empty.
            </p>
            <p className="text-xs text-muted-foreground">
              Future-you is going to appreciate this page. Start your first session above!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40 rounded-xl border border-border/60 bg-card/50 overflow-hidden">
            {summary.recentSessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setSelectedSession(session)}
                className="w-full text-left p-3 sm:px-4 flex items-center justify-between hover:bg-accent/40 transition-colors group"
              >
                <div className="space-y-0.5 min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground truncate">
                      {session.subject}
                    </span>
                    {session.topic && (
                      <>
                        <span className="text-muted-foreground/60 text-xs">·</span>
                        <span className="text-xs text-muted-foreground truncate">
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
                        <span className="text-foreground/80 font-medium">
                          {session.outcome}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary" className="font-mono text-xs font-semibold">
                    {formatDuration(session.durationSeconds)}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                </div>
              </button>
            ))}
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
