"use client";

import * as React from "react";
import { Trash2, Edit3, Clock } from "lucide-react";
import { type StudySession } from "@/db/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateSession, deleteSession } from "@/lib/actions";
import { describeActionError } from "@/lib/action-errors";
import { formatDuration, formatTime, formatDateGroup } from "@/lib/timer";

interface SessionDetailModalProps {
  session: StudySession | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

export function SessionDetailModal({
  session,
  open,
  onOpenChange,
  onDeleted,
}: SessionDetailModalProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Edit fields
  const [subject, setSubject] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [goal, setGoal] = React.useState("");
  const subjectFieldId = React.useId();
  const topicFieldId = React.useId();
  const goalFieldId = React.useId();
  const outcomeFieldId = React.useId();
  const notesFieldId = React.useId();
  const [outcome, setOutcome] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (session) {
      setSubject(session.subject);
      setTopic(session.topic || "");
      setGoal(session.goal || "");
      setOutcome(session.outcome || "");
      setNotes(session.notes || "");
      setIsEditing(false);
      setIsDeleting(false);
      setError(null);
    }
  }, [session, open]);

  if (!session) return null;

  // Both of these used to close the modal unconditionally, discarding the
  // ActionResult: a save or a delete that the server refused looked exactly
  // like one that worked, and the user was left believing their change was
  // saved. The modal now stays open and says what happened.
  const handleUpdate = async () => {
    if (!subject.trim()) {
      setError("Subject cannot be empty.");
      return;
    }
    setIsSubmitting(true);
    setError(null);

    // User cannot update duration of finished session
    const res = await updateSession(session.id, {
      subject: subject.trim(),
      topic: topic.trim() || undefined,
      goal: goal.trim() || undefined,
      outcome: outcome.trim() || undefined,
      notes: notes.trim() || undefined,
    });

    setIsSubmitting(false);

    if (!res.success) {
      setError(describeActionError(res.error, "Changes were not saved."));
      return;
    }

    setIsEditing(false);
    onOpenChange(false);
  };

  const handleDelete = async () => {
    setIsSubmitting(true);
    setError(null);

    const res = await deleteSession(session.id);

    setIsSubmitting(false);

    if (!res.success) {
      setIsDeleting(false);
      setError(describeActionError(res.error, "The session was not deleted."));
      return;
    }

    setIsDeleting(false);
    onOpenChange(false);
    onDeleted?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {session.topic || session.subject}
            <Badge variant="outline" className="font-normal">
              {formatDateGroup(session.startedAt)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2 text-[13px] leading-relaxed font-medium text-destructive"
          >
            {error}
          </p>
        )}

        {isDeleting ? (
          <div className="space-y-4 text-center">
            <p className="text-sm font-medium text-foreground">
              Delete this session?
            </p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              It will be removed from your history and from your analytics. This
              cannot be undone.
            </p>
            <div className="flex justify-center gap-2 pt-1">
              <Button
                variant="ghost"
                onClick={() => setIsDeleting(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Deleting…" : "Delete session"}
              </Button>
            </div>
          </div>
        ) : isEditing ? (
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <label htmlFor={subjectFieldId} className="text-[13px] font-medium text-foreground">
                Subject
              </label>
              <Input
                id={subjectFieldId}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={topicFieldId} className="text-[13px] font-medium text-foreground">
                Topic
              </label>
              <Input
                id={topicFieldId}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[13px]">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Clock className="size-3.5" />
                Duration
              </span>
              <span className="font-mono tabular-nums text-foreground">
                {formatDuration(session.durationSeconds)}
                <span className="ml-1.5 font-sans text-muted-foreground">locked</span>
              </span>
            </div>

            <div className="space-y-1.5">
              <label htmlFor={goalFieldId} className="text-[13px] font-medium text-foreground">
                Goal
              </label>
              <Input
                id={goalFieldId}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Finish chapter 4"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={outcomeFieldId} className="text-[13px] font-medium text-foreground">
                Outcome
              </label>
              <Input
                id={outcomeFieldId}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={notesFieldId} className="text-[13px] font-medium text-foreground">
                Notes
              </label>
              <Textarea
                id={notesFieldId}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                onClick={() => setIsEditing(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button variant="default" onClick={handleUpdate} disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
              {[
                { label: "Focused", value: formatDuration(session.durationSeconds) },
                { label: "Paused", value: formatDuration(session.pausedSeconds) },
              ].map((item) => (
                <div key={item.label} className="bg-card px-4 py-3">
                  <dt className="type-label">{item.label}</dt>
                  <dd className="type-metric mt-1 text-[19px]">{item.value}</dd>
                </div>
              ))}
            </dl>

            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
              <span>Started {formatTime(session.startedAt)}</span>
              {session.endedAt && (
                <>
                  <span aria-hidden>·</span>
                  <span>Ended {formatTime(session.endedAt)}</span>
                </>
              )}
            </p>

            <div className="space-y-3.5 text-sm">
              {session.goal && (
                <div className="space-y-1">
                  <span className="type-label">Goal</span>
                  <p className="text-foreground">{session.goal}</p>
                </div>
              )}

              {session.outcome && (
                <div className="space-y-1">
                  <span className="type-label">Outcome</span>
                  <p className="text-foreground">{session.outcome}</p>
                </div>
              )}

              {session.notes && (
                <div className="space-y-1">
                  <span className="type-label">Notes</span>
                  <p className="whitespace-pre-wrap leading-relaxed text-foreground">
                    {session.notes}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="sm:justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:bg-destructive/8 hover:text-destructive"
                onClick={() => setIsDeleting(true)}
              >
                <Trash2 className="size-3.5" />
                Delete
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <Edit3 className="size-3.5" />
                Edit
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
