import {
  getDailyAnalytics,
  getSubjectAnalytics,
  getTopicAnalytics,
} from "@/lib/queries";
import { getUserTimeZone, requireUser } from "@/lib/session";
import { getWeekRange } from "@/lib/timezone";
import { AnalyticsView } from "@/components/analytics-view";
import { TimezoneSync } from "@/components/timezone-sync";

/**
 * The whole analytics payload behind one boundary.
 *
 * The four tiles, the week chart, and the subject/topic panels are all derived
 * from the same three aggregations over the same week, and they cross-reference
 * each other — the cards summarise `dailyMetrics`, and the panels are scoped to
 * the same range so their totals agree with it. Splitting them would mean either
 * repeating the aggregations or rendering panels that briefly disagree with the
 * chart above them. One boundary, three queries, all fired at once.
 */
export async function AnalyticsStream() {
  const user = await requireUser();
  const timeZone = await getUserTimeZone();

  // One week, one zone, three queries. The subject and topic panels sit under a
  // "This Week" header, so they have to answer for this week — passing them an
  // all-time range is how the panels and the cards above them ended up
  // describing different datasets.
  const reference = new Date();
  const week = getWeekRange(reference, timeZone);
  const range = { from: week.from, to: week.to };

  const [dailyMetrics, subjectMetrics, topicMetrics] = await Promise.all([
    getDailyAnalytics(user.id, reference, timeZone),
    getSubjectAnalytics(user.id, range),
    getTopicAnalytics(user.id, range),
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
    <>
      {/* Every number on this page is bucketed by the user's zone, so a first
          visit rendered in the server's fallback zone needs one re-render. */}
      <TimezoneSync serverTimeZone={timeZone} />
      <AnalyticsView
        dailyMetrics={dailyMetrics}
        subjectMetrics={subjectMetrics}
        topicMetrics={topicMetrics}
        totalWeeklySeconds={totalWeeklySeconds}
        totalWeeklySessions={totalWeeklySessions}
        avgSessionSeconds={avgSessionSeconds}
        longestDayLabel={longestDayLabel}
      />
    </>
  );
}
