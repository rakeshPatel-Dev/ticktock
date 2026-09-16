import {
  getDailyAnalytics,
  getSubjectAnalytics,
  getTopicAnalytics,
} from "@/lib/queries";
import { AnalyticsView } from "@/components/analytics-view";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const [dailyMetrics, subjectMetrics, topicMetrics] = await Promise.all([
    getDailyAnalytics(),
    getSubjectAnalytics(),
    getTopicAnalytics(),
  ]);

  const totalWeeklySeconds = dailyMetrics.reduce(
    (acc, cur) => acc + cur.durationSeconds,
    0
  );
  const totalWeeklySessions = dailyMetrics.reduce(
    (acc, cur) => acc + cur.sessionCount,
    0
  );

  const avgSessionSeconds =
    totalWeeklySessions > 0
      ? Math.round(totalWeeklySeconds / totalWeeklySessions)
      : 0;

  // Find day with highest focus duration
  let longestDayLabel = "";
  let maxDayDuration = 0;
  for (const day of dailyMetrics) {
    if (day.durationSeconds > maxDayDuration) {
      maxDayDuration = day.durationSeconds;
      longestDayLabel = `${day.dayLabel}`;
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 w-full">
      <div className="space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Analytics
        </h1>
        <p className="text-sm text-muted-foreground">
          Understand where your focus and study time goes with clear, honest data.
        </p>
      </div>

      <AnalyticsView
        dailyMetrics={dailyMetrics}
        subjectMetrics={subjectMetrics}
        topicMetrics={topicMetrics}
        totalWeeklySeconds={totalWeeklySeconds}
        totalWeeklySessions={totalWeeklySessions}
        avgSessionSeconds={avgSessionSeconds}
        longestDayLabel={longestDayLabel}
      />
    </div>
  );
}
