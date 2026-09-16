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
  durationSeconds: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFinished?: () => void;
}

export function FinishSessionModal({
  sessionId,
  durationSeconds,
  open,
  onOpenChange,
  onFinished,
}: FinishSessionModalProps) {
  const [outcome, setOutcome] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [celebrating, setCelebrating] = React.useState(false);

  const handleSave = async () => {
    setIsSubmitting(true);
    const res = await finishSession(sessionId, {
      outcome: outcome || undefined,
      notes: notes.trim() || undefined,
    });

    setIsSubmitting(false);

    if (res.success) {
      setCelebrating(true);
      setTimeout(() => {
        onOpenChange(false);
        onFinished?.();
        setOutcome(null);
        setNotes("");
        setCelebrating(false);
      }, 1200);
    }
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
                {formatDuration(durationSeconds)}
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
              <div className="rounded-3xl bg-muted/50 border border-border/60 p-5 text-center">
                <span className="text-4xl font-black tracking-tight text-foreground font-mono">
                  {formatDuration(durationSeconds)}
                </span>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-1">
                  total focused time
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">
                  What did you accomplish?{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </label>
                <div className="grid grid-cols-2 mt-1 sm:grid-cols-3 gap-2">
                  {OUTCOME_OPTIONS.map((opt) => {
                    const isSelected = outcome === opt.label;
                    return (
                      <button
                        key={opt.label}
                        type="button"
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
                <label className="text-sm font-semibold text-foreground">
                  Notes{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </label>
                <Textarea
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
