"use client";

import * as React from "react";
import Image from "next/image";
import { Play, Pause, Square, Maximize2, Minimize2 } from "lucide-react";
import { type StudySession } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { pauseSession, resumeSession } from "@/lib/actions";
import { formatTimerDisplay } from "@/lib/timer";
import { getSubjectColor } from "@/lib/colors";
import {
  getShortcut,
  matchesShortcut,
  shortcutHintClass,
  shortcutKbdClass,
} from "@/lib/shortcuts";
import { StartSessionModal } from "./start-session";
import { FinishSessionModal } from "./session-form";
import { cn } from "@/lib/utils";

const startShortcut = getShortcut("start");
const pauseResumeShortcut = getShortcut("pauseResume");
const finishShortcut = getShortcut("finish");
const toggleFullScreenShortcut = getShortcut("toggleFullScreen");
const exitFullScreenShortcut = getShortcut("exitFullScreen");

interface TimerProps {
  initialSession: StudySession | null;
  subjects?: string[];
}

function computeCurrentElapsed(session: StudySession | null): number {
  if (!session) return 0;
  if (session.status === "active") {
    // Use float precision (no Math.floor) so the display advances the instant
    // a full second is reached, not up to 1 second late.
    const nowF = Date.now() / 1000;
    const raw = Math.max(0, nowF - session.startedAt);
    return Math.max(0, raw - session.pausedSeconds);
  } else if (session.status === "paused") {
    // Paused: use server-recorded updatedAt (integer seconds) — exact
    const raw = Math.max(0, session.updatedAt - session.startedAt);
    return Math.max(0, raw - session.pausedSeconds);
  }
  // Finished: durationSeconds is the authoritative recorded value
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
  const [isFullScreen, setIsFullScreen] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);

  // Sync with prop when server revalidates
  React.useEffect(() => {
    setSession(initialSession);
    if (!initialSession && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
  }, [initialSession]);

  // Enter / exit real browser fullscreen
  const enterFullScreen = React.useCallback(() => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    }
  }, []);

  const exitFullScreen = React.useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
  }, []);

  const toggleFullScreen = React.useCallback(() => {
    if (document.fullscreenElement) {
      exitFullScreen();
    } else {
      enterFullScreen();
    }
  }, [enterFullScreen, exitFullScreen]);

  // Keep React state in sync with actual browser fullscreen state
  // (handles Esc key natively managed by the browser)
  React.useEffect(() => {
    const onFsChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

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

    // 100ms interval: computeCurrentElapsed uses float-precision Date.now(),
    // so the displayed second advances the instant it's reached (≤100ms lag).
    const interval = setInterval(() => {
      setElapsed(computeCurrentElapsed(session));
    }, 100);

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

      if (matchesShortcut(pauseResumeShortcut, e) && session) {
        e.preventDefault();
        if (session.status === "active") {
          void handlePause();
        } else if (session.status === "paused") {
          void handleResume();
        }
      }

      if (matchesShortcut(startShortcut, e) && !session && !isStarting) {
        e.preventDefault();
        setIsStarting(true);
      }

      if (matchesShortcut(finishShortcut, e) && session && !isFinishing) {
        e.preventDefault();
        setIsFinishing(true);
      }

      if (matchesShortcut(toggleFullScreenShortcut, e) && session) {
        e.preventDefault();
        toggleFullScreen();
      }
      // Esc to exit fullscreen is handled natively by the browser;
      // the fullscreenchange listener above keeps React state in sync.
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [session, isStarting, isFinishing, handlePause, handleResume, toggleFullScreen]);

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
        <div className="rounded-4xl border border-border/50 bg-card p-6 sm:p-10 lg:p-14 text-center [box-shadow:var(--shadow-card),inset_0_1px_0_oklch(1_0_0_/_0.6)]">
          <div className="relative space-y-6 max-w-xl mx-auto">
            <div className="inline-flex items-center justify-center p-1 rounded-full overflow-hidden mb-1">
              <Image
                src="/images/session_buddy.svg"
                alt="Start session"
                width={150}
                height={150}
                className="h-28 w-28 sm:h-40 sm:w-40"
              />
            </div>

            <div className="space-y-3">
              <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-foreground">
                Ready to focus?
              </h2>
              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-md mx-auto">
                Track your focused time honestly and simply.
              </p>
            </div>

            <div className="pt-2">
              <StartSessionModal
                subjects={subjects}
                open={isStarting}
                onOpenChange={setIsStarting}
              />
            </div>

            <p className={`${shortcutHintClass("start")} text-sm text-muted-foreground font-semibold`}>
              Press{" "}
              <kbd className="font-mono bg-muted/80 px-2.5 py-0.5 rounded-full border border-border font-bold shadow-2xs">
                {startShortcut.label}
              </kbd>{" "}
              to start instantly
            </p>
          </div>
        </div>
      )}

      {/* State: Running or Paused (normal view) */}
      {session && colorTheme && !isFullScreen && (
        <div
          className={cn(
            "rounded-4xl border p-6 sm:p-10 lg:p-14 text-center transition-all duration-300 relative backdrop-blur-xl",
            session.status === "active"
              ? "border-emerald-500/30 bg-card [box-shadow:var(--shadow-card),0_0_50px_rgba(16,185,129,0.08),inset_0_1px_0_oklch(1_0_0_/_0.6)]"
              : "border-amber-500/30 bg-card [box-shadow:var(--shadow-card),0_0_50px_rgba(245,158,11,0.08),inset_0_1px_0_oklch(1_0_0_/_0.6)]"
          )}
        >
          {/* Top Row: Fullscreen button */}
          <div className="absolute top-6 right-6 sm:top-8 sm:right-8">
            <Button
              variant="outline"
              size="sm"
              onClick={enterFullScreen}
              className="rounded-full gap-2 text-xs font-semibold px-3.5 py-1.5 text-muted-foreground hover:text-foreground bg-card/80 border-border/70 shadow-2xs hover:shadow-xs transition-all"
              title="Full screen (M)"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Full Screen</span>
              <kbd className={`${shortcutKbdClass("toggleFullScreen")} font-mono bg-muted px-1.5 py-0.5 rounded-full text-[10px] border border-border font-bold`}>
                {toggleFullScreenShortcut.label}
              </kbd>
            </Button>
          </div>

          <div className="@container relative space-y-6 w-full max-w-xl mx-auto">
            {/* Subject & Topic Header */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <span
                  className={cn(
                    "px-4 py-1 rounded-full text-xs sm:text-sm font-black border shadow-2xs",
                    colorTheme.badge
                  )}
                >
                  {session.subject}
                </span>

                {session.status === "paused" ? (
                  <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-xs font-extrabold text-amber-700 dark:text-amber-300 border border-amber-500/30 bg-amber-500/15 shadow-sm shadow-amber-500/15">
                    <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                    Timer Paused
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-xs font-extrabold text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 bg-emerald-500/15 shadow-sm shadow-emerald-500/15">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    Active Focus
                  </div>
                )}
              </div>

              {session.topic && (
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                  {session.topic}
                </h2>
              )}
              {session.goal && (
                <p className="text-sm sm:text-base text-muted-foreground font-medium">
                  <span className="font-semibold text-foreground/80">Goal:</span> {session.goal}
                </p>
              )}
            </div>

            {/* Digital Timer Display */}
            <div className="py-2 sm:py-4">
              <div
                className={cn(
                  "text-[clamp(2.5rem,20cqw,7rem)] font-mono font-black tracking-tight select-none transition-all duration-300 leading-none w-full",
                  session.status === "active"
                    ? "text-foreground drop-shadow-sm"
                    : "text-muted-foreground opacity-60"
                )}
              >
                {formatTimerDisplay(displayElapsed)}
              </div>
              <p className="text-xs sm:text-sm uppercase font-extrabold tracking-widest text-muted-foreground/80 mt-4">
                {session.status === "active" ? "Deep Focus in Progress" : "Timer Paused"}
              </p>
            </div>

            {/* Playful Pill Control Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3.5 pt-2">
              {session.status === "active" ? (
                <Button
                  variant="amber"
                  size="lg"
                  onClick={handlePause}
                  disabled={actionLoading}
                  className="gap-2.5 px-8 text-base shadow-md hover:scale-105 active:scale-95 transition-all"
                >
                  <Pause className="h-5 w-5 fill-current" />
                  Pause
                </Button>
              ) : (
                <Button
                  variant="emerald"
                  size="lg"
                  onClick={handleResume}
                  disabled={actionLoading}
                  className="gap-2.5 px-8 text-base shadow-md hover:scale-105 active:scale-95 transition-all"
                >
                  <Play className="h-5 w-5 fill-current" />
                  Resume
                </Button>
              )}

              <Button
                variant="rose"
                size="lg"
                onClick={() => setIsFinishing(true)}
                disabled={actionLoading}
                className="gap-2.5 px-8 text-base shadow-md hover:scale-105 active:scale-95 transition-all"
              >
                <Square className="h-5 w-5 fill-current" />
                Finish
              </Button>
            </div>

            {/* Shortcut hint */}
            <p className={`${shortcutHintClass("pauseResume", "finish", "toggleFullScreen")} text-sm text-muted-foreground/80 font-medium`}>
              <kbd className="font-mono bg-muted/80 px-2 py-0.5 rounded-full border border-border shadow-2xs font-bold">
                {pauseResumeShortcut.label}
              </kbd>{" "}
              to {session.status === "active" ? "pause" : "resume"} ·{" "}
              <kbd className="font-mono bg-muted/80 px-2 py-0.5 rounded-full border border-border shadow-2xs font-bold">
                {finishShortcut.label}
              </kbd>{" "}
              to finish ·{" "}
              <kbd className="font-mono bg-muted/80 px-2 py-0.5 rounded-full border border-border shadow-2xs font-bold">
                M
              </kbd>{" "}
              for full screen
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

      {/* Full Screen Immersive Mode — rendered inside the fullscreen element */}
      {session && colorTheme && isFullScreen && (
        <div className="@container fixed inset-0 z-50 bg-background flex flex-col justify-between p-6 sm:p-10 md:p-14 overflow-hidden animate-in fade-in duration-200">
          {/* Top Bar */}
          <div className="flex items-center justify-between w-full max-w-6xl mx-auto">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-black border shadow-2xs",
                  colorTheme.badge
                )}
              >
                {session.subject}
              </span>

              {session.status === "paused" ? (
                <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-xs font-extrabold text-amber-700 dark:text-amber-300 border border-amber-500/30 bg-amber-500/15 shadow-sm shadow-amber-500/15">
                  <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                  Timer Paused
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-xs font-extrabold text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 bg-emerald-500/15 shadow-sm shadow-emerald-500/15">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  Active Focus
                </div>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={exitFullScreen}
              className="rounded-full gap-2 text-xs font-semibold px-4 shadow-2xs"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              Exit
              <kbd className={`${shortcutKbdClass("exitFullScreen")} font-mono bg-muted/80 px-1.5 py-0.5 rounded-full text-[10px] border border-border font-bold`}>
                {exitFullScreenShortcut.label}
              </kbd>
            </Button>
          </div>

          {/* Center Immersive Timer */}
          <div className="flex flex-col items-center justify-center text-center space-y-6 my-auto">
            {session.topic && (
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground max-w-2xl">
                {session.topic}
              </h2>
            )}
            {session.goal && (
              <p className="text-base sm:text-lg text-muted-foreground font-medium max-w-lg">
                <span className="font-semibold text-foreground/80">Goal:</span> {session.goal}
              </p>
            )}

            <div className="select-none">
              <div
                className={cn(
                  "font-mono font-black tracking-tight leading-none transition-all duration-300",
                  // Scales with the fullscreen container so the timer never overflows
                  "text-[clamp(2.75rem,13cqw,16rem)]",
                  session.status === "active"
                    ? "text-foreground"
                    : "text-muted-foreground opacity-60"
                )}
              >
                {formatTimerDisplay(displayElapsed)}
              </div>
              <p className="text-base sm:text-lg uppercase font-bold tracking-widest text-muted-foreground/70 mt-6">
                {session.status === "active" ? "Deep Focus in Progress" : "Timer Paused"}
              </p>
            </div>

            {/* Pill Control Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              {session.status === "active" ? (
                <Button
                  variant="amber"
                  size="lg"
                  onClick={handlePause}
                  disabled={actionLoading}
                  className="gap-2.5 px-10 py-4 text-lg shadow-lg hover:scale-105 active:scale-95 transition-all"
                >
                  <Pause className="h-5 w-5 fill-current" />
                  Pause
                </Button>
              ) : (
                <Button
                  variant="emerald"
                  size="lg"
                  onClick={handleResume}
                  disabled={actionLoading}
                  className="gap-2.5 px-10 py-4 text-lg shadow-lg hover:scale-105 active:scale-95 transition-all"
                >
                  <Play className="h-5 w-5 fill-current" />
                  Resume
                </Button>
              )}

              <Button
                variant="rose"
                size="lg"
                onClick={() => {
                  exitFullScreen();
                  setIsFinishing(true);
                }}
                disabled={actionLoading}
                className="gap-2.5 px-10 py-4 text-lg shadow-lg hover:scale-105 active:scale-95 transition-all"
              >
                <Square className="h-5 w-5 fill-current" />
                Finish
              </Button>
            </div>
          </div>

          {/* Bottom Shortcut bar */}
          <div className={`${shortcutHintClass("pauseResume", "finish", "exitFullScreen", "toggleFullScreen")} text-center text-sm text-muted-foreground/70 font-medium max-w-6xl mx-auto`}>
            Press{" "}
            <kbd className="font-mono bg-muted/80 px-2 py-0.5 rounded-full border border-border font-bold shadow-2xs">
              {pauseResumeShortcut.label}
            </kbd>{" "}
            to {session.status === "active" ? "pause" : "resume"} ·{" "}
            <kbd className="font-mono bg-muted/80 px-2 py-0.5 rounded-full border border-border font-bold shadow-2xs">
              {finishShortcut.label}
            </kbd>{" "}
            to finish ·{" "}
            <kbd className="font-mono bg-muted/80 px-2 py-0.5 rounded-full border border-border font-bold shadow-2xs">
              {exitFullScreenShortcut.label}
            </kbd>{" "}
            or{" "}
            <kbd className="font-mono bg-muted/80 px-2 py-0.5 rounded-full border border-border font-bold shadow-2xs">
              {toggleFullScreenShortcut.label}
            </kbd>{" "}
            to exit
          </div>

          {/* Finish Modal (must stay mounted so it can open) */}
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
