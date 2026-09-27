import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { studySessions } from "@/db";
import { toStudySession } from "@/db/schema";
import { formatDuration } from "@/lib/timer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "json";

  const dateStr = new Date().toISOString().split("T")[0];

  if (format === "csv") {
    const headers = [
      "date",
      "started_at",
      "ended_at",
      "subject",
      "topic",
      "duration_seconds",
      "duration_formatted",
      "paused_seconds",
      "status",
      "outcome",
      "goal",
      "notes",
    ];

    const escapeCsv = (val: unknown): string => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Streamed through a cursor and serialized row-by-row: the previous version
    // materialized the entire history, then a second array of row arrays, then
    // the joined string — three copies in memory at once.
    const lines: string[] = [headers.join(",")];
    const cursor = studySessions
      .find({ userId: session.user.id })
      .sort({ startedAt: -1 });

    for await (const doc of cursor) {
      const s = toStudySession(doc);
      const row = [
        new Date(s.startedAt * 1000).toISOString().split("T")[0],
        new Date(s.startedAt * 1000).toISOString(),
        s.endedAt ? new Date(s.endedAt * 1000).toISOString() : "",
        escapeCsv(s.subject),
        escapeCsv(s.topic),
        s.durationSeconds,
        escapeCsv(formatDuration(s.durationSeconds)),
        s.pausedSeconds,
        s.status,
        escapeCsv(s.outcome),
        escapeCsv(s.goal),
        escapeCsv(s.notes),
      ];
      lines.push(row.join(","));
    }

    const csvContent = lines.join("\n");

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ticktock-sessions-${dateStr}.csv"`,
      },
    });
  }

  // Default JSON export
  const allSessions = (
    await studySessions
      .find({ userId: session.user.id })
      .sort({ startedAt: -1 })
      .toArray()
  ).map(toStudySession);

  const exportData = {
    appName: "TickTock",
    exportedAt: new Date().toISOString(),
    totalSessions: allSessions.length,
    sessions: allSessions,
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ticktock-export-${dateStr}.json"`,
    },
  });
}
