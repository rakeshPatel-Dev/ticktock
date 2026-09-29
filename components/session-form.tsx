"use client";

import * as React from "react";
import { Check } from "lucide-react";
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

/**
 * Outcome tags.
 *
 * These carried a distinct hover colour and a distinct solid fill each — six
 * options that each turned into a different brand colour when selected. They
 * are one question with six answers, so they are one control style and one
 * accent.
 */
const OUTCOME_OPTIONS = [
  "Learned",
  "Revised",
  "Solved problems",
  "Built something",
  "Practiced",
  "Nothing specific",
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
      <DialogContent>
        {celebrating ? (
          /*
            The confirmation a session deserves: the number, and the fact it was
            saved. It was a bouncing trophy and "Woohoo! 🎉" — an animation
            bouncing for 1.2s reads as an interruption when the person is trying
            to close the dialog and get back to work.
          */
          <div className="flex flex-col items-center justify-center gap-4 py-12 text-center animate-in fade-in duration-200">
            <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Check className="size-5" />
            </div>
            <div>
              <h3 className="text-[17px] font-semibold tracking-[-0.01em]">Session saved</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-medium tabular-nums text-foreground">
                  {formatDuration(savedDuration ?? durationSeconds)}
                </span>{" "}
                focused
              </p>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Finish session</DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2 text-[13px] leading-relaxed font-medium text-destructive"
                >
                  {error}
                </p>
              )}

              <p className="text-[13px] text-muted-foreground">
                <span className="font-mono text-[15px] font-medium tabular-nums text-foreground">
                  {formatDuration(durationSeconds)}
                </span>{" "}
                of focused time
              </p>

              <div className="space-y-2">
                <span
                  id={outcomeGroupId}
                  className="text-[13px] font-medium text-foreground"
                >
                  What did you get done?{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </span>
                <div
                  role="group"
                  aria-labelledby={outcomeGroupId}
                  className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
                >
                  {OUTCOME_OPTIONS.map((label) => {
                    const isSelected = outcome === label;
                    return (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setOutcome(isSelected ? null : label)}
                        className={cn(
                          "rounded-full border px-3.5 py-1.5 text-left text-[13px] font-medium transition-all duration-200",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground font-semibold shadow-[0_2px_12px_-2px_color-mix(in_oklch,var(--primary)_50%,transparent),inset_0_1px_0_rgba(255,255,255,0.25)]"
                            : "border-border/80 bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor={notesFieldId} className="text-[13px] font-medium text-foreground">
                  Notes{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <Textarea
                  id={notesFieldId}
                  placeholder="Takeaways, what to pick up next time…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={isSubmitting} variant="default">
                  {isSubmitting ? "Saving…" : "Save session"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
