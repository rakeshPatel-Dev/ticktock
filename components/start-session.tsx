"use client";

import * as React from "react";
import Image from "next/image";
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
import { getSubjectColor } from "@/lib/colors";
import { cn } from "@/lib/utils";

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

    const res = await createSession({
      subject: subject.trim(),
      topic: topic.trim() || undefined,
      goal: goal.trim() || undefined,
    });

    setIsSubmitting(false);

    if (res.success) {
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
            <Button
              variant="sky"
              size="lg"
              className="gap-2.5 px-8 text-base shadow-lg shadow-sky-500/25 hover:shadow-sky-500/40 hover:scale-105 active:scale-95 transition-all"
            >
              <Play className="h-5 w-5 fill-current" />
              Start Session
            </Button>
          }
        />
      )}

      <DialogContent className="sm:max-w-md rounded-4xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
            <div className="p-0.5 rounded-full overflow-hidden shadow-sm">
              <Image src="/images/session_buddy.svg" alt="Start session" width={30} height={30} />
            </div>
            Start a Session
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="p-3 text-xs rounded-2xl bg-destructive/10 text-destructive border border-destructive/25 leading-relaxed font-medium">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">
              Subject <span className="text-destructive">*</span>
            </label>
            <Input
              ref={subjectInputRef}
              placeholder="e.g. Writing, Biology, Design, Piano, Study"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={isSubmitting}
              autoComplete="off"
              className="h-11 rounded-full mt-1 px-4 text-sm"
            />

            {/* Playful colorful subject suggestion pills */}
            {!subject && (
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {(subjects.length > 0
                  ? subjects.slice(0, 6)
                  : ["Writing", "Reading", "Study", "Design", "Project", "Practice"]
                ).map((s) => {
                  const theme = getSubjectColor(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSubject(s)}
                      className={cn(
                        "text-xs font-semibold px-3 py-1 rounded-full border transition-all active:scale-95 shadow-2xs",
                        theme.pill
                      )}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">
              Topic <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              placeholder="e.g. Chapter 4, Draft outline, Presentation"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={isSubmitting}
              className="h-11 rounded-full mt-1 px-4 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">
              Goal <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              placeholder="e.g. Write 1,000 words, read 20 pages, review notes"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              disabled={isSubmitting}
              className="h-11 rounded-full mt-1 px-4 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="sky"
              disabled={isSubmitting || !subject.trim()}
              className="rounded-full px-6"
            >
              {isSubmitting ? "Starting..." : "Start Timer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
