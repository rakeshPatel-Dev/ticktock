"use client";

import * as React from "react";
import { Trash2, Edit3, Calendar, Clock, Target, CheckCircle2, FileText, PauseCircle } from "lucide-react";
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

  // Edit fields
  const [subject, setSubject] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [goal, setGoal] = React.useState("");
  const [outcome, setOutcome] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [durationMinutes, setDurationMinutes] = React.useState(0);

  React.useEffect(() => {
    if (session) {
      setSubject(session.subject);
      setTopic(session.topic || "");
      setGoal(session.goal || "");
      setOutcome(session.outcome || "");
      setNotes(session.notes || "");
      setDurationMinutes(Math.round(session.durationSeconds / 60));
      setIsEditing(false);
      setIsDeleting(false);
    }
  }, [session, open]);

  if (!session) return null;

  const handleUpdate = async () => {
    if (!subject.trim()) return;
    setIsSubmitting(true);
    await updateSession(session.id, {
      subject: subject.trim(),
      topic: topic.trim() || undefined,
      goal: goal.trim() || undefined,
      outcome: outcome.trim() || undefined,
      notes: notes.trim() || undefined,
      durationSeconds: Math.max(0, durationMinutes * 60),
    });
    setIsSubmitting(false);
    setIsEditing(false);
    onOpenChange(false);
  };

  const handleDelete = async () => {
    setIsSubmitting(true);
    await deleteSession(session.id);
    setIsSubmitting(false);
    setIsDeleting(false);
    onOpenChange(false);
    onDeleted?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold flex items-center justify-between">
            <span>Session Details</span>
            <Badge variant="outline" className="text-xs font-normal">
              {formatDateGroup(session.startedAt)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {isDeleting ? (
          <div className="py-4 space-y-4 text-center">
            <p className="text-sm font-medium text-foreground">
              Are you sure you want to delete this session?
            </p>
            <p className="text-xs text-muted-foreground">
              This will permanently delete the session from your history and update all analytics.
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDeleting(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Deleting..." : "Confirm Delete"}
              </Button>
            </div>
          </div>
        ) : isEditing ? (
          <div className="space-y-3 py-2 text-left">
            <div className="space-y-1">
              <label className="text-xs font-medium">Subject</label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Topic</label>
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">Duration (minutes)</label>
                <Input
                  type="number"
                  min={0}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Goal</label>
                <Input
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Outcome</label>
              <Input
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Notes</label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleUpdate} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2 text-left">
            {/* Subject and Topic header */}
            <div className="space-y-1">
              <h3 className="text-xl font-bold tracking-tight text-foreground">
                {session.subject}
              </h3>
              {session.topic && (
                <p className="text-sm font-medium text-muted-foreground">
                  {session.topic}
                </p>
              )}
            </div>

            {/* Metrics pills */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Focused Duration
                </span>
                <p className="text-base font-semibold text-foreground mt-0.5">
                  {formatDuration(session.durationSeconds)}
                </p>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <PauseCircle className="h-3.5 w-3.5" /> Paused Time
                </span>
                <p className="text-base font-semibold text-foreground mt-0.5">
                  {formatDuration(session.pausedSeconds)}
                </p>
              </div>
            </div>

            {/* Time meta */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground border-y border-border/40 py-2">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDateGroup(session.startedAt)}
              </span>
              <span>•</span>
              <span>Started at {formatTime(session.startedAt)}</span>
              {session.endedAt && (
                <>
                  <span>•</span>
                  <span>Ended at {formatTime(session.endedAt)}</span>
                </>
              )}
            </div>

            {/* Goal, Outcome, Notes */}
            <div className="space-y-2.5 text-xs">
              {session.goal && (
                <div className="space-y-0.5">
                  <span className="font-semibold text-muted-foreground flex items-center gap-1">
                    <Target className="h-3 w-3" /> Goal
                  </span>
                  <p className="text-foreground">{session.goal}</p>
                </div>
              )}

              {session.outcome && (
                <div className="space-y-0.5">
                  <span className="font-semibold text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Outcome
                  </span>
                  <p className="text-foreground">{session.outcome}</p>
                </div>
              )}

              {session.notes && (
                <div className="space-y-0.5">
                  <span className="font-semibold text-muted-foreground flex items-center gap-1">
                    <FileText className="h-3 w-3" /> Notes
                  </span>
                  <p className="text-foreground whitespace-pre-wrap leading-relaxed">
                    {session.notes}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="flex items-center justify-between pt-3 sm:justify-between border-t border-border/40">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setIsDeleting(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <Edit3 className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
