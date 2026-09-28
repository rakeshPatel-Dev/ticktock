"use client";

import * as React from "react";
import { CheckCircle2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { finishSession } from "@/lib/actions";
import { describeActionError } from "@/lib/action-errors";
import { formatDuration } from "@/lib/timer";
import { cn } from "@/lib/utils";

const OUTCOME_OPTIONS = [
  { label: "Learned", color: "hover:border-sky-500 hover:text-sky-500", active: "bg-sky-500 text-white border-sky-500 font-bold" },
  { label: "Revised", color: "hover:border-amber-500 hover:text-amber-500", active: "bg-amber-500 text-white border-amber-500 font-bold" },
  { label: "Solved problems", color: "hover:border-emerald-500 hover:text-emerald-500", active: "bg-emerald-500 text-white border-emerald-500 font-bold" },
  { label: "Built something", color: "hover:border-orange-500 hover:text-orange-500", active: "bg-orange-500 text-white border-orange-500 font-bold" },
  { label: "Practiced", color: "hover:border-rose-500 hover:text-rose-500", active: "bg-rose-500 text-white border-rose-500 font-bold" },
  { label: "Nothing specific", color: "hover:border-foreground/40", active: "bg-foreground text-background border-foreground font-bold" },
];

interface FinishSessionModalProps {
  sessionId: string;
  /**
   * The focused total to record, frozen by the caller at the moment Finish was
   * pressed. It is also what the form previews, so the two cannot disagree.
   */
  durationSeconds: number;
  /** Focused-seconds complement, banked by the timer store across every pause. */
  pausedSeconds?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFinished?: () => void;
}

export function FinishSessionModal({
  sessionId,
  durationSeconds,
  pausedSeconds = 0,
  open,
  onOpenChange,
  onFinished,
}: FinishSessionModalProps) {
  const [outcome, setOutcome] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [celebrating, setCelebrating] = React.useState(false);
  // What the server says it stored. The client is the clock, so the number
  // arrives from the client — but the server clamps it to the wall-clock span it
  // can vouch for, and the number the user is congratulated on has to be the
  // number that actually got saved, not the one that was asked for.
  const [savedDuration, setSavedDuration] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const notesFieldId = React.useId();
  const outcomeGroupId = React.useId();

  // A failure belongs to one attempt, not to the next time this opens.
  React.useEffect(() => {
    if (open) setError(null);
  }, [open, sessionId]);

  const handleSave = async () => {
    setIsSubmitting(true);
    setError(null);

    const res = await finishSession(sessionId, {
      outcome: outcome || undefined,
      notes: notes.trim() || undefined,
      durationSeconds,
      pausedSeconds,
    });

    setIsSubmitting(false);

    // The failure branch is the point: without it the button simply stopped
    // spinning and the modal sat there, leaving no way to tell whether the
    // session had been saved. The notes stay in the form so a retry is one
    // click rather than retyping.
    if (!res.success) {
      setError(
        describeActionError(
          res.error,
          "Could not finish this session. Your outcome and notes were not saved."
        )
      );
      return;
    }

    setSavedDuration(res.data.durationSeconds);
    setCelebrating(true);
    setTimeout(() => {
      onOpenChange(false);
      onFinished?.();
      setOutcome(null);
      setNotes("");
      setSavedDuration(null);
      setCelebrating(false);
    }, 1200);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-4xl">
        {celebrating ? (
          <div className="py-10 flex flex-col items-center justify-center text-center space-y-3 animate-in fade-in zoom-in-95 duration-200">
            <div className="h-16 w-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-bounce">
              <Trophy className="h-8 w-8" />
            </div>
            <h3 className="text-2xl font-extrabold tracking-tight">Woohoo! 🎉</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              You focused for{" "}
              <span className="font-bold text-foreground">
                {formatDuration(savedDuration ?? durationSeconds)}
              </span>
              . High five!
            </p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <div className="p-1.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                Session Complete!
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-1">
              {error && (
                <p
                  role="alert"
                  className="p-3 text-xs rounded-2xl bg-destructive/10 text-destructive border border-destructive/25 leading-relaxed font-medium"
                >
                  {error}
                </p>
              )}

              <div className="rounded-3xl bg-muted/50 border border-border/60 p-5 text-center">
                <span className="text-4xl font-black tracking-tight text-foreground font-mono">
                  {formatDuration(durationSeconds)}
                </span>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-1">
                  total focused time
                </p>
              </div>

              <div className="space-y-2">
                <span
                  id={outcomeGroupId}
                  className="text-sm font-semibold text-foreground"
                >
                  What did you accomplish?{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </span>
                <div
                  role="group"
                  aria-labelledby={outcomeGroupId}
                  className="grid grid-cols-2 mt-1 sm:grid-cols-3 gap-2"
                >
                  {OUTCOME_OPTIONS.map((opt) => {
                    const isSelected = outcome === opt.label;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() =>
                          setOutcome(isSelected ? null : opt.label)
                        }
                        className={cn(
                          "text-xs sm:text-sm font-semibold px-3 py-2 rounded-full border text-center transition-all duration-150 active:scale-95",
                          isSelected
                            ? opt.active + " shadow-xs"
                            : cn("border-border/70 bg-card text-muted-foreground hover:text-foreground", opt.color)
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor={notesFieldId} className="text-sm font-semibold text-foreground">
                  Notes{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </label>
                <Textarea
                  id={notesFieldId}
                  placeholder="Key takeaways, thoughts, or next steps..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  disabled={isSubmitting}
                  className="rounded-3xl mt-1 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                  className="rounded-full"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isSubmitting}
                  variant="sky"
                  className="rounded-full px-7 h-11 font-bold text-sm"
                >
                  {isSubmitting ? "Saving..." : "Save Session"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
