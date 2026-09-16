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
import { getSubjectColor } from "@/lib/colors";
import { cn } from "@/lib/utils";

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

  React.useEffect(() => {
    if (session) {
      setSubject(session.subject);
      setTopic(session.topic || "");
      setGoal(session.goal || "");
      setOutcome(session.outcome || "");
      setNotes(session.notes || "");
      setIsEditing(false);
      setIsDeleting(false);
    }
  }, [session, open]);

  if (!session) return null;

  const handleUpdate = async () => {
    if (!subject.trim()) return;
    setIsSubmitting(true);
    // User cannot update duration of finished session
    await updateSession(session.id, {
      subject: subject.trim(),
      topic: topic.trim() || undefined,
      goal: goal.trim() || undefined,
      outcome: outcome.trim() || undefined,
      notes: notes.trim() || undefined,
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

  const theme = getSubjectColor(session.subject);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-4xl">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl font-bold flex items-center justify-between">
            <span>Session Details</span>
            <Badge variant="outline" className="text-xs font-semibold rounded-full px-3 py-1">
              {formatDateGroup(session.startedAt)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {isDeleting ? (
          <div className="py-4 space-y-4 text-center">
            <p className="text-base font-bold text-foreground">
              Are you sure you want to delete this session?
            </p>
            <p className="text-sm text-muted-foreground">
              This will permanently delete the session from your history and update all analytics.
            </p>
            <div className="flex justify-center gap-2.5 pt-2">
              <Button
                variant="outline"
                size="default"
                onClick={() => setIsDeleting(false)}
                disabled={isSubmitting}
                className="rounded-full"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="default"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="rounded-full"
              >
                {isSubmitting ? "Deleting..." : "Confirm Delete"}
              </Button>
            </div>
          </div>
        ) : isEditing ? (
          <div className="space-y-3.5 py-2 text-left">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">Subject</label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-11 rounded-full text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">Topic</label>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="h-11 rounded-full text-sm"
              />
            </div>
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-muted/40 border border-border/50 text-sm">
              <span className="text-muted-foreground font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-sky-500" /> Tracked Duration
              </span>
              <span className="font-mono font-bold text-foreground">
                {formatDuration(session.durationSeconds)} (locked)
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">Goal</label>
              <Input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Read 20 pages, finish chapter"
                className="h-11 rounded-full text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">Outcome</label>
              <Input
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                className="h-11 rounded-full text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">Notes</label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="rounded-3xl text-sm"
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <Button
                variant="outline"
                size="default"
                onClick={() => setIsEditing(false)}
                disabled={isSubmitting}
                className="rounded-full"
              >
                Cancel
              </Button>
              <Button
                size="default"
                variant="sky"
                onClick={handleUpdate}
                disabled={isSubmitting}
                className="rounded-full px-6"
              >
                {isSubmitting ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2 text-left">
            {/* Subject and Topic header */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-bold border shadow-2xs",
                    theme.badge
                  )}
                >
                  {session.subject}
                </span>
              </div>
              {session.topic && (
                <p className="text-lg font-bold text-foreground">
                  {session.topic}
                </p>
              )}
            </div>

            {/* Metrics pills */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-3xl border border-border/60 bg-muted/30 p-3.5">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-sky-500" /> Focused Duration
                </span>
                <p className="text-2xl font-black text-foreground mt-1">
                  {formatDuration(session.durationSeconds)}
                </p>
              </div>

              <div className="rounded-3xl border border-border/60 bg-muted/30 p-3.5">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <PauseCircle className="h-3.5 w-3.5 text-amber-500" /> Paused Time
                </span>
                <p className="text-2xl font-black text-foreground mt-1">
                  {formatDuration(session.pausedSeconds)}
                </p>
              </div>
            </div>

            {/* Time meta */}
            <div className="flex items-center gap-3 text-xs sm:text-sm text-muted-foreground border-y border-border/40 py-2.5 font-medium">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
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
            <div className="space-y-3 text-sm">
              {session.goal && (
                <div className="space-y-0.5">
                  <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5 text-orange-500" /> Goal
                  </span>
                  <p className="text-foreground font-medium text-sm sm:text-base">{session.goal}</p>
                </div>
              )}

              {session.outcome && (
                <div className="space-y-0.5">
                  <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Outcome
                  </span>
                  <p className="text-foreground font-medium text-sm sm:text-base">{session.outcome}</p>
                </div>
              )}

              {session.notes && (
                <div className="space-y-0.5">
                  <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-rose-500" /> Notes
                  </span>
                  <p className="text-foreground whitespace-pre-wrap leading-relaxed text-sm sm:text-base">
                    {session.notes}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="flex items-center justify-between pt-3 sm:justify-between border-t border-border/40">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full"
                onClick={() => setIsDeleting(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full px-4"
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
