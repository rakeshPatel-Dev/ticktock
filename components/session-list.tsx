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
import { Badge } from "@/components/ui/badge";
import { formatDuration, formatTime, formatDateGroup } from "@/lib/timer";
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

      // Subject filter
      if (selectedSubject !== "all" && session.subject !== selectedSubject) {
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
    <div className="space-y-6">
      {/* Controls: Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search subject, topic, or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card/60"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Subject Filter */}
          <Select
            value={selectedSubject}
            onValueChange={(val) => setSelectedSubject(val || "all")}
          >
            <SelectTrigger className="w-[140px] sm:w-[160px] bg-card/60">
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

          {/* Date Filter */}
          <Select
            value={dateRange}
            onValueChange={(val) => setDateRange(val || "all")}
          >
            <SelectTrigger className="w-[120px] bg-card/60">
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

      {/* Session History List Grouped by Date */}
      {groupKeys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 p-12 text-center space-y-2.5">
          <div className="h-10 w-10 mx-auto rounded-full bg-muted flex items-center justify-center text-muted-foreground">
            <Inbox className="h-5 w-5" />
          </div>
          <p className="text-base font-semibold text-foreground">
            No sessions found
          </p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {initialSessions.length === 0
              ? "Your history is empty. Future-you is going to appreciate this page. Start your first session on the dashboard!"
              : "Try adjusting your search query or filters to see more results."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupKeys.map((groupLabel) => (
            <div key={groupLabel} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pl-1">
                {groupLabel}
              </h4>

              <div className="divide-y divide-border/40 rounded-xl border border-border/60 bg-card/50 overflow-hidden shadow-2xs">
                {groupedSessions[groupLabel].map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setActiveDetailSession(session)}
                    className="w-full text-left p-3.5 sm:px-4 flex items-center justify-between hover:bg-accent/40 transition-colors group"
                  >
                    <div className="space-y-1 min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground truncate">
                          {session.subject}
                        </span>
                        {session.topic && (
                          <>
                            <span className="text-muted-foreground/60 text-xs">·</span>
                            <span className="text-xs text-muted-foreground font-medium truncate">
                              {session.topic}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTime(session.startedAt)}
                        </span>
                        {session.outcome && (
                          <>
                            <span>•</span>
                            <span className="px-1.5 py-0.5 rounded bg-muted text-foreground text-[11px] font-medium">
                              {session.outcome}
                            </span>
                          </>
                        )}
                        {session.notes && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[200px] text-muted-foreground/80 italic">
                              &ldquo;{session.notes}&rdquo;
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <Badge variant="secondary" className="font-mono text-xs font-semibold">
                        {formatDuration(session.durationSeconds)}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Session Details Modal */}
      <SessionDetailModal
        session={activeDetailSession}
        open={!!activeDetailSession}
        onOpenChange={(open) => !open && setActiveDetailSession(null)}
      />
    </div>
  );
}
