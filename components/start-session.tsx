"use client";

import * as React from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createSession } from "@/lib/actions";
import { describeActionError } from "@/lib/action-errors";
import { startFromServer } from "@/lib/timer-store";

interface StartSessionProps {
  subjects?: string[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerButton?: boolean;
}

export function StartSessionModal({
  subjects = [],
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  triggerButton = true,
}: StartSessionProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? setControlledOpen! : setInternalOpen;

  const [subject, setSubject] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [goal, setGoal] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const subjectFieldId = React.useId();
  const topicFieldId = React.useId();
  const goalFieldId = React.useId();

  const subjectInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setTimeout(() => subjectInputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) {
      setError("Please enter a subject");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    // Epoch seconds from the user's own clock, at the click. The row has to
    // start where the display starts, and the display counts on this clock —
    // a server-stamped origin compared against the browser's was what made the
    // timer begin late and stay offset.
    const startedAt = Math.floor(Date.now() / 1000);

    const res = await createSession({
      subject: subject.trim(),
      topic: topic.trim() || undefined,
      goal: goal.trim() || undefined,
      startedAt,
    });

    setIsSubmitting(false);

    if (res.success) {
      // Hand the session to the store so the timer appears on this click,
      // instead of whenever the revalidation behind this request happens to
      // reach the client.
      startFromServer(res.data);
      setOpen(false);
    } else {
      setError(
        describeActionError(res.error, "Failed to start session")
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {triggerButton && (
        <DialogTrigger
          render={
            <Button variant="default" size="lg" className="px-8">
              <Play className="size-4" />
              Start session
            </Button>
          }
        />
      )}

      <DialogContent>
        <DialogHeader>
          <DialogTitle>New session</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2 text-[13px] leading-relaxed font-medium text-destructive"
            >
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor={subjectFieldId} className="text-[13px] font-medium text-foreground">
              Subject <span className="text-destructive">*</span>
            </label>
            <Input
              id={subjectFieldId}
              ref={subjectInputRef}
              placeholder="e.g. Mathematics, Biology, Design"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={isSubmitting}
              autoComplete="off"
              className="h-10"
            />

            {/*
              Recent subjects as neutral chips. They used to be tinted with a
              per-subject pastel; six suggestions in six different colours is
              the interface pointing at itself instead of at the form.
            */}
            {!subject && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(subjects.length > 0
                  ? subjects.slice(0, 6)
                  : ["Reading", "Writing", "Study", "Design", "Project", "Practice"]
                ).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSubject(s)}
                    className="rounded-full border border-border/80 bg-background px-3 py-1 text-[12px] font-medium text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/10 hover:text-primary hover:shadow-[0_2px_8px_color-mix(in_oklch,var(--primary)_20%,transparent)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor={topicFieldId} className="text-[13px] font-medium text-foreground">
              Topic{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              id={topicFieldId}
              placeholder="e.g. Chapter 4, Integration by parts"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={isSubmitting}
              className="h-10"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={goalFieldId} className="text-[13px] font-medium text-foreground">
              Goal{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              id={goalFieldId}
              placeholder="e.g. Finish problems 1-20"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              disabled={isSubmitting}
              className="h-10"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="default" disabled={isSubmitting || !subject.trim()}>
              {isSubmitting ? "Starting…" : "Start timer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
