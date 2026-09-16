"use client";

import * as React from "react";
import { Play, Pause, Square, CircleDot } from "lucide-react";
import { type StudySession } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pauseSession, resumeSession } from "@/lib/actions";
import { formatTimerDisplay } from "@/lib/timer";
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
    // Optimistic local update
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
      // Ignore if user is inside an input, textarea, or contentEditable
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      // Space: Pause or Resume
      if (e.code === "Space" && session) {
        e.preventDefault();
        if (session.status === "active") {
          void handlePause();
        } else if (session.status === "paused") {
          void handleResume();
        }
      }

      // S: Start Session
      if (e.key.toLowerCase() === "s" && !session && !isStarting) {
        e.preventDefault();
        setIsStarting(true);
      }

      // F: Finish Session
      if (e.key.toLowerCase() === "f" && session && !isFinishing) {
        e.preventDefault();
        setIsFinishing(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [session, isStarting, isFinishing, handlePause, handleResume]);

  const displayElapsed = session ? (session.status === "active" ? elapsed : computeCurrentElapsed(session)) : 0;

  return (
    <div className="flex flex-col items-center justify-center py-10 sm:py-14 text-center">
      {/* State: Idle */}
      {!session && (
        <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="space-y-1.5">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Ready to code?
            </h2>
            <p className="text-sm text-muted-foreground">
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

          <p className="text-xs text-muted-foreground/80">
            Press <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded border border-border">S</kbd> to start
          </p>
        </div>
      )}

      {/* State: Running or Paused */}
      {session && (
        <div className="space-y-6 w-full max-w-lg mx-auto">
          {/* Subject & Topic Header */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-center gap-2">
              <span className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                {session.subject}
              </span>
              {session.status === "paused" ? (
                <Badge variant="secondary" className="text-xs font-medium">
                  Paused
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-xs font-medium gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/5"
                >
                  <CircleDot className="h-2 w-2 animate-ping" />
                  Active
                </Badge>
              )}
            </div>
            {session.topic && (
              <p className="text-sm text-muted-foreground font-medium">
                {session.topic}
              </p>
            )}
            {session.goal && (
              <p className="text-xs text-muted-foreground/80 italic">
                Goal: {session.goal}
              </p>
            )}
          </div>

          {/* Digital Timer Display */}
          <div className="relative py-2">
            <div
              className={cn(
                "text-6xl sm:text-7xl font-mono font-black tracking-tighter select-none transition-all duration-300",
                session.status === "active"
                  ? "text-foreground"
                  : "text-muted-foreground opacity-75"
              )}
            >
              {formatTimerDisplay(displayElapsed)}
            </div>
            <p className="text-xs uppercase font-medium tracking-widest text-muted-foreground mt-2">
              {session.status === "active" ? "Focused Time" : "Timer Paused"}
            </p>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-center gap-3 pt-1">
            {session.status === "active" ? (
              <Button
                variant="outline"
                size="lg"
                onClick={handlePause}
                disabled={actionLoading}
                className="gap-2 px-5 min-w-[110px]"
              >
                <Pause className="h-4 w-4" />
                Pause
              </Button>
            ) : (
              <Button
                variant="default"
                size="lg"
                onClick={handleResume}
                disabled={actionLoading}
                className="gap-2 px-5 min-w-[110px]"
              >
                <Play className="h-4 w-4 fill-current" />
                Resume
              </Button>
            )}

            <Button
              variant="secondary"
              size="lg"
              onClick={() => setIsFinishing(true)}
              disabled={actionLoading}
              className="gap-2 px-5"
            >
              <Square className="h-4 w-4 fill-current" />
              Finish
            </Button>
          </div>

          {/* Shortcut hint */}
          <p className="text-xs text-muted-foreground/70">
            <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded border border-border">Space</kbd> to {session.status === "active" ? "pause" : "resume"} · <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded border border-border">F</kbd> to finish
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
      )}
    </div>
  );
}
