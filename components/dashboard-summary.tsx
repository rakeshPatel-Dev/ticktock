"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { type DashboardSummary } from "@/lib/queries";
import { type StudySession } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDuration, formatTime } from "@/lib/timer";
import { useDailyGoalHours } from "@/lib/daily-goal";
import { cn } from "@/lib/utils";
import { SessionDetailModal } from "./session-detail-modal";

interface DashboardSummaryProps {
  summary: DashboardSummary;
}

export function DashboardSummaryView({ summary }: DashboardSummaryProps) {
  const [selectedSession, setSelectedSession] = React.useState<StudySession | null>(null);
  // The goal the user actually saved, not a hard-coded 4. The default is the
  // value for the first paint — and for every user who never set one — because
  // localStorage is unreadable during SSR; the effect inside the hook swaps in
  // the stored value a frame later.
  const { hours: dailyGoalHours } = useDailyGoalHours();

  const goalSeconds = dailyGoalHours * 3600;
  const progressPercent = Math.min(
    100,
    Math.round((summary.totalFocusedSeconds / goalSeconds) * 100)
  );

  // Thoughtful non-punitive messaging
  const getGoalMessage = () => {
    if (summary.totalFocusedSeconds === 0) {
      return "Nothing tracked yet today.";
    }
    if (summary.totalFocusedSeconds >= goalSeconds) {
      return "Daily goal reached.";
    }
    return `${formatDuration(goalSeconds - summary.totalFocusedSeconds)} to go.`;
  };

  // One row, one hairline between each figure, no icon chips.
  //
  // These were four separate cards, each with its own pastel icon circle in a
  // different colour, which spent four of the screen's four available signals
  // on saying "this is a number". They are now read as one strip of figures
  // separated by rules — the same device a spec sheet uses.
  const stats = [
    { label: "Focused", value: formatDuration(summary.totalFocusedSeconds) },
    { label: "Sessions", value: String(summary.sessionCount) },
    { label: "Subjects", value: String(summary.subjectCount) },
    { label: "Longest", value: formatDuration(summary.longestSessionSeconds) },
  ];

  return (
    <div className="space-y-6 w-full">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="type-label">Today&apos;s goal</span>
              <span className="text-[14px] font-bold text-primary tabular-nums">
                {progressPercent}%
              </span>
            </div>

            <p className="type-metric">{formatDuration(summary.totalFocusedSeconds)}</p>

            <div className="space-y-2.5">
              <Progress value={progressPercent} className="h-[6px]" />
              <p className="text-[13px] text-muted-foreground">
                {getGoalMessage()}{" "}
                <span className="text-muted-foreground/70">
                  Goal {dailyGoalHours}h
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="sm:w-[22rem]">
          <CardContent className="flex h-full items-center">
            <dl className="grid w-full grid-cols-2 grid-rows-2 gap-y-5 [&>*]:min-w-0">
              {stats.map((stat, i) => (
                <div
                  key={stat.label}
                  className={cn(
                    "min-w-0",
                    // A hairline on the left of every cell except the first
                    // column, which is what makes this read as a table of
                    // figures rather than a scatter of cards.
                    i % 2 === 1 && "border-l border-border pl-5"
                  )}
                >
                  <dt className="type-label">{stat.label}</dt>
                  <dd className="type-metric mt-1 text-[26px]">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="type-label">Recent sessions</h3>
          {summary.recentSessions.length > 0 && (
            <Link
              href="/sessions"
              className="group flex items-center gap-0.5 text-[13px] font-semibold text-primary transition-colors hover:brightness-110"
            >
              All sessions
              <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>

        {summary.recentSessions.length === 0 ? (
          <div className="rounded-4xl border border-dashed border-border/60 bg-card px-6 py-14 text-center [box-shadow:var(--shadow-card)]">
            <p className="text-sm font-medium text-foreground">
              No sessions yet today
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Start one above and it will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-4xl border border-border/60 bg-card [box-shadow:var(--shadow-card)]">
            {summary.recentSessions.map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => setSelectedSession(session)}
                  className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-all hover:bg-primary/[0.04] dark:hover:bg-primary/[0.08]"
                >
                  <div className="min-w-0">
                    {/* Subject is a quiet uppercase label and the topic is the
                        line that matters — the previous order made the topic,
                        the thing you actually recognise, the smaller word. */}
                    <p className="truncate text-[15px] font-medium tracking-[-0.01em] text-foreground transition-colors group-hover:text-primary">
                      {session.topic || session.subject}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
                      <span className="truncate">{session.subject}</span>
                      <span aria-hidden>·</span>
                      <span>{formatTime(session.startedAt)}</span>
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-[13px] font-medium tabular-nums text-secondary-foreground transition-colors group-hover:text-primary">
                      {formatDuration(session.durationSeconds)}
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground/40 transition-all group-hover:text-primary group-hover:translate-x-0.5" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SessionDetailModal
        session={selectedSession}
        open={!!selectedSession}
        onOpenChange={(open) => !open && setSelectedSession(null)}
      />
    </div>
  );
}
