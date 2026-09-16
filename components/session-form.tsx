"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
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
  "Learned",
  "Revised",
  "Solved problems",
  "Built something",
  "Practiced",
  "Nothing specific",
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

  React.useEffect(() => {
    if (!open) {
      setOutcome(null);
      setNotes("");
      setCelebrating(false);
    }
  }, [open]);

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
      }, 1200);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {celebrating ? (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-3 animate-in fade-in zoom-in-95 duration-200">
            <div className="h-12 w-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h3 className="text-xl font-bold tracking-tight">Nice.</h3>
            <p className="text-sm text-muted-foreground">
              You focused for{" "}
              <span className="font-semibold text-foreground">
                {formatDuration(durationSeconds)}
              </span>
              . Good work!
            </p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">
                Session complete
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-1">
              <div className="rounded-lg bg-muted/60 p-3 text-center">
                <span className="text-2xl font-bold tracking-tight text-foreground">
                  {formatDuration(durationSeconds)}
                </span>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">
                  focused time
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">
                  What did you accomplish?{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {OUTCOME_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        setOutcome(outcome === opt ? null : opt)
                      }
                      className={cn(
                        "text-xs px-2.5 py-1.5 rounded-md border text-center transition-all",
                        outcome === opt
                          ? "bg-foreground text-background border-foreground font-medium shadow-xs"
                          : "border-border/70 bg-card hover:bg-accent/60 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Notes{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </label>
                <Textarea
                  placeholder="Key takeaways, problems solved, or next steps..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save session"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
