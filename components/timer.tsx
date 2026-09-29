"use client";

import * as React from "react";
import { Play, Pause, Square, Maximize2, Minimize2 } from "lucide-react";
import type { StudySession } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { formatTimerDisplay } from "@/lib/timer";
import { AnimatedGlyph } from "@/components/animated-glyph";
import {
  clear,
  pause,
  readFinalTotals,
  reconcileFromServer,
  resume,
  seedFromServer,
  useTimerSnapshot,
  type FinalTotals,
} from "@/lib/timer-store";
import {
  getShortcut,
  isEditableTarget,
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

/**
 * The gate. It renders a placeholder until the store can produce a value the
 * server could not have guessed, then mounts the real timer.
 *
 * The two live in separate components rather than being an early return in one,
 * because the body has a dozen hooks: returning early between them would make
 * hook order depend on whether the store had hydrated, which is exactly the
 * class of bug that produces "rendered fewer hooks than expected" a few frames
 * later. Mounting the body fresh is also honest — it is a first mount, not a
 * hydration, so it gets a real first render rather than a reconciled one.
 */
export function Timer({ initialSession, subjects = [] }: TimerProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  /**
   * Only the running/paused card needs holding back. With no session the idle
   * hero is a pure function of `initialSession === null`, so the server and the
   * first client render agree on it already and there is nothing to wait for —
   * gating it as well just hid the "Ready to focus?" hero behind a placeholder
   * for a few frames on every page load.
   */
  if (initialSession && !mounted) return <TimerPlaceholder />;
  return <TimerBody initialSession={initialSession} subjects={subjects} />;
}

/** The card shell and the clock's own size, so nothing resizes on hydration. */
const CARD_CLASS =
  "relative w-full overflow-hidden rounded-4xl border border-border/60 bg-card px-6 py-14 text-center [box-shadow:var(--shadow-raised)] sm:px-12 sm:py-16";
const CLOCK_CLASS =
  "type-display w-full text-[clamp(4rem,19cqw,7.5rem)] select-none";

/**
 * Shown for the handful of frames before the store can answer. Same card shell
 * as the live timer, so the number appearing does not resize the page.
 */
function TimerPlaceholder() {
  return (
    <div className={CARD_CLASS}>
      <div className="@container relative mx-auto w-full max-w-xl">
        <div className={cn(CLOCK_CLASS, "text-muted-foreground/20")} aria-hidden>
          --:--:--
        </div>
      </div>
    </div>
  );
}

/**
 * Running or paused, in one word and one dot.
 *
 * The two states are the only place in the app that spends a saturated colour,
 * and they spend the same one: green for running, amber for paused. Previously
 * each also carried its own tinted card border, coloured glow and pill, so the
 * same information was stated three times in three colours.
 */
function TimerState({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-medium",
        active ? "text-running-foreground" : "text-paused-foreground"
      )}
    >
      <span className="relative flex size-2">
        {active && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-running opacity-75" />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            active ? "bg-running shadow-[0_0_8px_var(--running)]" : "bg-paused shadow-[0_0_8px_var(--paused)]"
          )}
        />
      </span>
      {active ? "Running" : "Paused"}
    </span>
  );
}

/**
 * A shortcut hint, in the app's own kbd chip. One component so the timer, the
 * idle hero and the fullscreen view cannot drift apart in how they render a key.
 */
function Kbd({ label, id }: { label: string; id?: Parameters<typeof shortcutKbdClass>[0] }) {
  return (
    <kbd
      className={cn(
        "rounded-[4px] border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground",
        id ? shortcutKbdClass(id) : undefined
      )}
    >
      {label}
    </kbd>
  );
}

/**
 * The elapsed clock, with each digit animating only when it actually changes.
 *
 * The seconds digits roll every second; the minutes digits hold still for a
 * minute at a time and then roll. Animating per glyph rather than per string is
 * what makes that read as a clock instead of a flickering number — and it is
 * why the glyphs sit in a fixed-width, monospaced grid: the animation is a
 * vertical swap, so a digit that changed width would shove its neighbours
 * sideways mid-roll.
 *
 * `aria-live` is deliberately off and the accessible name is on the wrapper
 * instead. A live region would announce the new time on every single tick, which
 * for a timer that runs for an hour means an hour of a screen reader narrating
 * numbers nobody asked for.
 */
function AnimatedTimerDisplay({
  elapsedSeconds,
  className,
}: {
  elapsedSeconds: number;
  className?: string;
}) {
  const label = formatTimerDisplay(elapsedSeconds);
  return (
    <div className={cn("flex justify-center", className)}>
      <span role="timer" aria-label={`Elapsed time ${label}`} className="contents">
        {label.split("").map((char, i) =>
          char === ":" ? (
            <span
              key={`sep-${i}`}
              aria-hidden
              className="relative inline-grid min-w-[0.5ch] place-items-center text-muted-foreground/45"
            >
              :
            </span>
          ) : (
            <AnimatedGlyph key={`d-${i}`} value={char} />
          )
        )}
      </span>
    </div>
  );
}

/**
 * A view over the timer store. It owns no timing state of its own — the elapsed
 * number, the running/paused flag, and the pause itself all live in
 * `lib/timer-store`, which is what lets them outlive this component: a route
 * change unmounts the timer, and it keeps counting.
 */
function TimerBody({ initialSession, subjects = [] }: TimerProps) {
  const { session, status, elapsedSeconds } = useTimerSnapshot();

  const [isFinishing, setIsFinishing] = React.useState(false);
  const [isStarting, setIsStarting] = React.useState(false);
  const [isFullScreen, setIsFullScreen] = React.useState(false);
  const [finalTotals, setFinalTotals] = React.useState<FinalTotals | null>(null);

  React.useEffect(() => {
    // Order matters. Seeding adopts the server's row when the store is empty;
    // reconciling then layers the persisted checkpoint on top, which is the only
    // thing that knows the user paused. Both are effects, never render.
    seedFromServer(initialSession);
    reconcileFromServer(initialSession);
    if (!session && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
  }, [initialSession, session]);

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

  /**
   * Pausing and resuming are pure local transitions. There is no request, which
   * is why there is nothing here that can be wrong for a round trip: no
   * optimistic copy of a server value, no pause anchor that arrives too late to
   * matter, no display that jumps and then snaps back.
   */
  const handlePause = React.useCallback(() => pause(), []);
  const handleResume = React.useCallback(() => resume(), []);

  /**
   * Snapshots the totals at the moment Finish is pressed. The modal can stay open
   * for as long as it takes to write notes, and what gets recorded should be the
   * number the user pressed Finish on — not whatever the clock has reached by the
   * time they hit Save, which is what the live prop used to show.
   */
  const handleFinish = React.useCallback(() => {
    setFinalTotals(readFinalTotals());
    setIsFinishing(true);
  }, []);

  const handleFinished = React.useCallback(() => {
    clear();
    setFinalTotals(null);
  }, []);

  // Global Keyboard Shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e)) return;

      if (matchesShortcut(pauseResumeShortcut, e) && session) {
        e.preventDefault();
        if (status === "running") {
          handlePause();
        } else if (status === "paused") {
          handleResume();
        }
      }

      if (matchesShortcut(startShortcut, e) && !session && !isStarting) {
        e.preventDefault();
        setIsStarting(true);
      }

      if (matchesShortcut(finishShortcut, e) && session && !isFinishing) {
        e.preventDefault();
        if (document.fullscreenElement) {
          exitFullScreen();
        }
        handleFinish();
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
  }, [session, status, isStarting, isFinishing, handlePause, handleResume, handleFinish, toggleFullScreen, exitFullScreen]);

  const isActive = status === "running";

  return (
    <div className="w-full">
      {/* State: Idle */}
      {!session && (
        <div className={CARD_CLASS}>
          {/* Subtle ambient accent glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(65% 55% at 50% 50%, color-mix(in oklch, var(--primary) 9%, transparent), transparent 70%)",
            }}
          />

          <div className="@container relative mx-auto w-full max-w-xl">
            {/* The clock at rest. It was replaced by a 160px mascot; a timer
                that shows a cartoon until you start it is hiding what it is. */}
            <div className="select-none text-muted-foreground/20" aria-hidden>
              <div className={CLOCK_CLASS}>00:00:00</div>
            </div>

            <p className="mt-8 text-[15px] font-medium text-muted-foreground">
              Ready when you are.
            </p>

            <div className="mt-6 flex justify-center">
              <StartSessionModal
                subjects={subjects}
                open={isStarting}
                onOpenChange={setIsStarting}
              />
            </div>

            <p
              className={cn(
                shortcutHintClass("start"),
                "mt-5 text-[11px] text-muted-foreground"
              )}
            >
              or press <Kbd label={startShortcut.label} /> to start
            </p>
          </div>
        </div>
      )}

      {/* State: Running or Paused (normal view) */}
      {session && !isFullScreen && (
        <div className={CARD_CLASS}>
          {/*
            The one place colour is earned: a soft bloom behind the clock, so
            "is it still running?" is answerable from across a room. It is a
            background wash, not a border, glow or badge restating the same
            fact three more times.
          */}
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 transition-opacity duration-500",
              isActive ? "opacity-100" : "opacity-0"
            )}
            style={{
              background:
                "radial-gradient(75% 65% at 50% 42%, color-mix(in oklch, var(--running) 24%, transparent) 0%, color-mix(in oklch, var(--primary) 12%, transparent) 50%, transparent 75%)",
            }}
          />

          <div className="relative flex justify-end">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={enterFullScreen}
              className="text-muted-foreground hover:text-foreground"
              title={`Full screen (${toggleFullScreenShortcut.label})`}
            >
              <Maximize2 className="size-4" />
              <span className="sr-only">Full screen</span>
            </Button>
          </div>

          <div className="@container relative mx-auto -mt-2 w-full max-w-xl">
            <div className="space-y-1.5">
              <div className="flex items-center justify-center gap-3">
                <span className="type-label">{session.subject}</span>
                <TimerState active={isActive} />
              </div>

              {session.topic && (
                <h2 className="text-lg font-semibold tracking-[-0.01em] text-foreground sm:text-xl">
                  {session.topic}
                </h2>
              )}
              {session.goal && (
                <p className="text-[13px] text-muted-foreground">{session.goal}</p>
              )}
            </div>

            <div className="mt-7 select-none text-foreground">
              <AnimatedTimerDisplay elapsedSeconds={elapsedSeconds} className={CLOCK_CLASS} />
            </div>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-2.5">
              {isActive ? (
                <Button variant="default" size="lg" onClick={handlePause} className="px-7">
                  <Pause className="size-4" />
                  Pause
                </Button>
              ) : (
                <Button variant="default" size="lg" onClick={handleResume} className="px-7">
                  <Play className="size-4" />
                  Resume
                </Button>
              )}

              <Button variant="outline" size="lg" onClick={handleFinish}>
                <Square className="size-3.5" />
                Finish
              </Button>
            </div>

            <p
              className={cn(
                shortcutHintClass("pauseResume", "finish", "toggleFullScreen"),
                "mt-6 text-[11px] text-muted-foreground"
              )}
            >
              <Kbd label={pauseResumeShortcut.label} id="pauseResume" /> to{" "}
              {isActive ? "pause" : "resume"} ·{" "}
              <Kbd label={finishShortcut.label} id="finish" /> to finish ·{" "}
              <Kbd label={toggleFullScreenShortcut.label} id="toggleFullScreen" /> for full
              screen
            </p>
          </div>
        </div>
      )}

      {/* Full Screen Immersive Mode — rendered inside the fullscreen element */}
      {session && isFullScreen && (
        <div className="@container fixed inset-0 z-50 flex flex-col justify-between overflow-hidden bg-background p-6 sm:p-10 md:p-14">
          <div className="flex w-full max-w-6xl items-center justify-between mx-auto">
            <div className="flex items-center gap-3">
              <span className="type-label">{session.subject}</span>
              <TimerState active={isActive} />
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={exitFullScreen}
              className="text-muted-foreground hover:text-foreground"
            >
              <Minimize2 className="size-3.5" />
              Exit
              <Kbd label={exitFullScreenShortcut.label} id="exitFullScreen" />
            </Button>
          </div>

          <div className="flex flex-col items-center justify-center gap-6 my-auto text-center">
            {session.topic && (
              <h2 className="max-w-2xl text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
                {session.topic}
              </h2>
            )}
            {session.goal && (
              <p className="max-w-lg text-sm text-muted-foreground">{session.goal}</p>
            )}

            <div className="select-none text-foreground">
              <AnimatedTimerDisplay
                elapsedSeconds={elapsedSeconds}
                className="type-display text-[clamp(3rem,12cqw,14rem)]"
              />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              {isActive ? (
                <Button variant="default" size="lg" onClick={handlePause} className="px-8">
                  <Pause className="size-4" />
                  Pause
                </Button>
              ) : (
                <Button variant="default" size="lg" onClick={handleResume} className="px-8">
                  <Play className="size-4" />
                  Resume
                </Button>
              )}

              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  exitFullScreen();
                  handleFinish();
                }}
              >
                <Square className="size-3.5" />
                Finish
              </Button>
            </div>
          </div>

          <div
            className={cn(
              shortcutHintClass("pauseResume", "finish", "exitFullScreen", "toggleFullScreen"),
              "mx-auto max-w-6xl text-center text-[11px] text-muted-foreground"
            )}
          >
            <Kbd label={pauseResumeShortcut.label} id="pauseResume" /> to{" "}
            {isActive ? "pause" : "resume"} ·{" "}
            <Kbd label={finishShortcut.label} id="finish" /> to finish
          </div>
        </div>
      )}

      {/* Finish Modal rendered once to preserve form and celebration state across fullscreen transitions */}
      {session && (
        <FinishSessionModal
          sessionId={session.id}
          durationSeconds={finalTotals?.durationSeconds ?? elapsedSeconds}
          pausedSeconds={finalTotals?.pausedSeconds ?? 0}
          open={isFinishing}
          onOpenChange={setIsFinishing}
          onFinished={handleFinished}
        />
      )}
    </div>
  );
}
