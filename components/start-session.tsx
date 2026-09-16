"use client";

import * as React from "react";
import { Play, Sparkles } from "lucide-react";
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

  const subjectInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setError(null);
      setTimeout(() => subjectInputRef.current?.focus(), 50);
    } else {
      setSubject("");
      setTopic("");
      setGoal("");
      setError(null);
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

    const res = await createSession({
      subject: subject.trim(),
      topic: topic.trim() || undefined,
      goal: goal.trim() || undefined,
    });

    setIsSubmitting(false);

    if (res.success) {
      setOpen(false);
    } else {
      if (res.error === "ACTIVE_SESSION_EXISTS") {
        setError(
          "You already have a session active or paused. Finish or resume it before starting a new one."
        );
      } else {
        setError(res.error || "Failed to start session");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {triggerButton && (
        <DialogTrigger
          render={
            <Button
              size="lg"
              className="gap-2 font-medium px-6 py-2.5 rounded-full shadow-md hover:shadow-lg transition-all"
            >
              <Play className="h-4 w-4 fill-current" />
              Start session
            </Button>
          }
        />
      )}

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Start Session
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {error && (
            <div className="p-3 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/20 leading-relaxed">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Subject <span className="text-destructive">*</span>
            </label>
            <Input
              ref={subjectInputRef}
              placeholder="e.g. DSA, Operating Systems, Web Dev"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={isSubmitting}
              autoComplete="off"
            />
            {/* Quick subject suggestion pills */}
            {subjects.length > 0 && !subject && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {subjects.slice(0, 5).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSubject(s)}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Topic <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              placeholder="e.g. Binary Search, Virtual Memory"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Goal <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              placeholder="e.g. Solve 5 problems, read chapter 4"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !subject.trim()}>
              {isSubmitting ? "Starting..." : "Start"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
