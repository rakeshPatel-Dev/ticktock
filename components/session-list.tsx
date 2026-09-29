"use client";

import * as React from "react";
import { Search, Clock, ChevronRight, Inbox } from "lucide-react";
import { type StudySession } from "@/db/schema";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDuration, formatTime, formatDateGroup } from "@/lib/timer";
import { isSameSubject } from "@/lib/subjects";
import { SessionDetailModal } from "./session-detail-modal";

interface SessionListProps {
  initialSessions: StudySession[];
  subjects: string[];
}

export function SessionListView({
  initialSessions,
  subjects,
}: SessionListProps) {
  const [search, setSearch] = React.useState("");
  const [selectedSubject, setSelectedSubject] = React.useState("all");
  const [dateRange, setDateRange] = React.useState("all");
  const [activeDetailSession, setActiveDetailSession] = React.useState<StudySession | null>(null);

  // Filter sessions locally for instant reactivity
  const filteredSessions = React.useMemo(() => {
    return initialSessions.filter((session) => {
      // Exclude running sessions if any
      if (session.status !== "completed") return false;

      // Subject filter. Compared through the shared subject key, not `===`:
      // the dropdown shows one spelling per subject while individual rows keep
      // whatever the user typed that day, so an exact match drops sessions the
      // moment the casing differs.
      if (selectedSubject !== "all" && !isSameSubject(session.subject, selectedSubject)) {
        return false;
      }

      // Date range filter
      if (dateRange !== "all") {
        const sessionDate = new Date(session.startedAt * 1000);
        const now = new Date();

        if (dateRange === "today") {
          const isToday =
            sessionDate.getFullYear() === now.getFullYear() &&
            sessionDate.getMonth() === now.getMonth() &&
            sessionDate.getDate() === now.getDate();
          if (!isToday) return false;
        } else if (dateRange === "week") {
          const oneWeekAgo = new Date();
          oneWeekAgo.setDate(now.getDate() - 7);
          if (sessionDate < oneWeekAgo) return false;
        }
      }

      // Search term
      if (search.trim()) {
        const query = search.toLowerCase().trim();
        const matchSubject = session.subject.toLowerCase().includes(query);
        const matchTopic = session.topic?.toLowerCase().includes(query);
        const matchGoal = session.goal?.toLowerCase().includes(query);
        const matchOutcome = session.outcome?.toLowerCase().includes(query);
        const matchNotes = session.notes?.toLowerCase().includes(query);
        if (!matchSubject && !matchTopic && !matchGoal && !matchOutcome && !matchNotes) {
          return false;
        }
      }

      return true;
    });
  }, [initialSessions, selectedSubject, dateRange, search]);

  // Group by natural date bucket
  const groupedSessions = React.useMemo(() => {
    const groups: { [key: string]: StudySession[] } = {};
    for (const session of filteredSessions) {
      const groupLabel = formatDateGroup(session.startedAt);
      if (!groups[groupLabel]) {
        groups[groupLabel] = [];
      }
      groups[groupLabel].push(session);
    }
    return groups;
  }, [filteredSessions]);

  const groupKeys = Object.keys(groupedSessions);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search subjects, topics, notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={selectedSubject}
            onValueChange={(val) => setSelectedSubject(val || "all")}
          >
            <SelectTrigger className="flex-1 sm:w-44">
              <SelectValue placeholder="All subjects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subjects</SelectItem>
              {subjects.map((sub) => (
                <SelectItem key={sub} value={sub}>
                  {sub}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={dateRange}
            onValueChange={(val) => setDateRange(val || "all")}
          >
            <SelectTrigger className="flex-1 sm:w-36">
              <SelectValue placeholder="All time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This week</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {groupKeys.length === 0 ? (
        <div className="rounded-4xl border border-border bg-card px-6 py-16 text-center [box-shadow:var(--shadow-card)]">
          <Inbox className="mx-auto size-5 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium text-foreground">No sessions found</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
            {initialSessions.length === 0
              ? "Your history is empty. Start a session from the dashboard."
              : "Try a different search term or filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupKeys.map((groupLabel) => (
            <section key={groupLabel}>
              <h4 className="type-label mb-2">{groupLabel}</h4>

              <ul className="divide-y divide-border/70 overflow-hidden rounded-4xl border border-border bg-card [box-shadow:var(--shadow-card)]">
                {groupedSessions[groupLabel].map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => setActiveDetailSession(session)}
                      className="group flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition-colors hover:bg-accent/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-medium tracking-[-0.01em] text-foreground">
                          {session.topic || session.subject}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
                          {session.topic && <span className="truncate">{session.subject}</span>}
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" />
                            {formatTime(session.startedAt)}
                          </span>
                          {session.outcome && (
                            <span className="truncate text-muted-foreground/80">
                              {session.outcome}
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <span className="font-mono text-[13px] font-medium tabular-nums text-secondary-foreground">
                          {formatDuration(session.durationSeconds)}
                        </span>
                        <ChevronRight className="size-4 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <SessionDetailModal
        session={activeDetailSession}
        open={!!activeDetailSession}
        onOpenChange={(open) => !open && setActiveDetailSession(null)}
      />
    </div>
  );
}
