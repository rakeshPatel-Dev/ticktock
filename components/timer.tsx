"use client";

import * as React from "react";
import { Play, Pause, Square, CircleDot, Sparkles } from "lucide-react";
import { type StudySession } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pauseSession, resumeSession } from "@/lib/actions";
import { formatTimerDisplay } from "@/lib/timer";
import { getSubjectColor } from "@/lib/colors";
import { StartSessionModal } from "./start-session";
import { FinishSessionModal } from "./session-form";
import { cn } from "@/lib/utils";

interface TimerProps {
  initialSession: StudySession | null;
  subjects?: string[];
}

function computeCurrentElapsed(session: StudySession | null): number {
  if (!session) return 0;
  const now = Math.floor(Date.now() / 1000);
  if (session.status === "active") {
    const raw = Math.max(0, now - session.startedAt);
    return Math.max(0, raw - session.pausedSeconds);
  } else if (session.status === "paused") {
    const raw = Math.max(0, session.updatedAt - session.startedAt);
    return Math.max(0, raw - session.pausedSeconds);
  }
  return session.durationSeconds;
}

export function Timer({ initialSession, subjects = [] }: TimerProps) {
  const [session, setSession] = React.useState<StudySession | null>(
    initialSession
  );
  const [elapsed, setElapsed] = React.useState<number>(() =>
    computeCurrentElapsed(initialSession)
  );
  const [isFinishing, setIsFinishing] = React.useState(false);
  const [isStarting, setIsStarting] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);

  // Sync with prop when server revalidates
  React.useEffect(() => {
    setSession(initialSession);
  }, [initialSession]);

  const handlePause = React.useCallback(async () => {
    if (!session || actionLoading) return;
    setActionLoading(true);
    setSession((prev) => (prev ? { ...prev, status: "paused" } : null));
    await pauseSession(session.id);
    setActionLoading(false);
  }, [session, actionLoading]);

  const handleResume = React.useCallback(async () => {
    if (!session || actionLoading) return;
    setActionLoading(true);
    setSession((prev) => (prev ? { ...prev, status: "active" } : null));
    await resumeSession(session.id);
    setActionLoading(false);
  }, [session, actionLoading]);

  // Interval for active session
  React.useEffect(() => {
    if (!session) return;

    if (session.status !== "active") {
      return;
    }

    const interval = setInterval(() => {
      setElapsed(computeCurrentElapsed(session));
    }, 1000);

    return () => clearInterval(interval);
  }, [session]);

  // Global Keyboard Shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === "Space" && session) {
        e.preventDefault();
        if (session.status === "active") {
          void handlePause();
        } else if (session.status === "paused") {
          void handleResume();
        }
      }

      if (e.key.toLowerCase() === "s" && !session && !isStarting) {
        e.preventDefault();
        setIsStarting(true);
      }

      if (e.key.toLowerCase() === "f" && session && !isFinishing) {
        e.preventDefault();
        setIsFinishing(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [session, isStarting, isFinishing, handlePause, handleResume]);

  const displayElapsed = session
    ? session.status === "active"
      ? elapsed
      : computeCurrentElapsed(session)
    : 0;

  const colorTheme = session ? getSubjectColor(session.subject) : null;

  return (
    <div className="w-full">
      {/* State: Idle */}
      {!session && (
        <div className="rounded-4xl border border-border/80 bg-card/60 backdrop-blur-md p-8 sm:p-14 text-center shadow-lg">
          <div className="relative space-y-6 max-w-md mx-auto">
            <div className="inline-flex items-center justify-center p-3 rounded-full bg-sky-500/10 text-sky-500 mb-1 shadow-inner">
              <Sparkles className="h-6 w-6 text-sky-500" />
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                Ready to dive in?
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Track the work. Don&apos;t turn tracking the work into the work.
              </p>
            </div>

            <div className="pt-2">
              <StartSessionModal
                subjects={subjects}
                open={isStarting}
                onOpenChange={setIsStarting}
              />
            </div>

            <p className="text-xs text-muted-foreground/80 font-medium">
              Press{" "}
              <kbd className="font-mono bg-muted/80 px-2 py-0.5 rounded-full border border-border font-bold shadow-2xs">
                S
              </kbd>{" "}
              to start instantly
            </p>
          </div>
        </div>
      )}

      {/* State: Running or Paused */}
      {session && colorTheme && (
        <div className="rounded-4xl border border-border/80 bg-card/70 backdrop-blur-md p-8 sm:p-12 text-center shadow-xl">

          <div className="relative space-y-6 w-full max-w-lg mx-auto">
            {/* Subject & Topic Header */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span
                  className={cn(
                    "px-4 py-1.5 rounded-full text-sm font-extrabold border shadow-2xs",
                    colorTheme.badge
                  )}
                >
                  {session.subject}
                </span>

                {session.status === "paused" ? (
                  <Badge
                    variant="secondary"
                    className="rounded-full px-3 py-1 text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                  >
                    Paused
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="rounded-full px-3 py-1 text-xs font-bold gap-1.5 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 shadow-2xs"
                  >
                    <CircleDot className="h-2.5 w-2.5 animate-ping" />
                    Active Focus
                  </Badge>
                )}
              </div>

              {session.topic && (
                <p className="text-base text-foreground font-semibold">
                  {session.topic}
                </p>
              )}
              {session.goal && (
                <p className="text-xs text-muted-foreground italic">
                  Goal: {session.goal}
                </p>
              )}
            </div>

            {/* Digital Timer Display */}
            <div className="py-2">
              <div
                className={cn(
                  "text-6xl sm:text-7xl md:text-8xl font-mono font-black tracking-tighter select-none transition-all duration-300",
                  session.status === "active"
                    ? "text-foreground drop-shadow-sm"
                    : "text-muted-foreground opacity-70"
                )}
              >
                {formatTimerDisplay(displayElapsed)}
              </div>
              <p className="text-xs uppercase font-bold tracking-widest text-muted-foreground/90 mt-2">
                {session.status === "active" ? "Focused Time" : "Timer Paused"}
              </p>
            </div>

            {/* Playful Pill Control Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {session.status === "active" ? (
                <Button
                  variant="amber"
                  size="lg"
                  onClick={handlePause}
                  disabled={actionLoading}
                  className="gap-2 px-6"
                >
                  <Pause className="h-4 w-4" />
                  Pause
                </Button>
              ) : (
                <Button
                  variant="emerald"
                  size="lg"
                  onClick={handleResume}
                  disabled={actionLoading}
                  className="gap-2 px-6"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Resume
                </Button>
              )}

              <Button
                variant="rose"
                size="lg"
                onClick={() => setIsFinishing(true)}
                disabled={actionLoading}
                className="gap-2 px-6"
              >
                <Square className="h-4 w-4 fill-current" />
                Finish
              </Button>
            </div>

            {/* Shortcut hint */}
            <p className="text-xs text-muted-foreground/80 font-medium">
              <kbd className="font-mono bg-muted/80 px-2 py-0.5 rounded-full border border-border shadow-2xs font-bold">
                Space
              </kbd>{" "}
              to {session.status === "active" ? "pause" : "resume"} ·{" "}
              <kbd className="font-mono bg-muted/80 px-2 py-0.5 rounded-full border border-border shadow-2xs font-bold">
                F
              </kbd>{" "}
              to finish
            </p>

            {/* Finish Modal */}
            <FinishSessionModal
              sessionId={session.id}
              durationSeconds={displayElapsed}
              open={isFinishing}
              onOpenChange={setIsFinishing}
              onFinished={() => setSession(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
