import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { formatDuration } from "@/lib/timer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "json";

  const allSessions = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, session.user.id))
    .orderBy(desc(sessions.startedAt));

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

    const rows = allSessions.map((s) => [
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
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((r) => r.join(",")),
    ].join("\n");

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ticktock-sessions-${dateStr}.csv"`,
      },
    });
  }

  // Default JSON export
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
