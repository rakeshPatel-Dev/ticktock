import {
  getDailyFocus,
  getHeatmapAnalytics,
  getSubjectAnalytics,
  getTopicAnalytics,
} from "@/lib/queries";
import { getUserTimeZone, requireUser } from "@/lib/session";
import { formatDateInZone, getHeatmapRange, WEEKDAY_LABELS } from "@/lib/timezone";
import { formatDayInMonth } from "@/lib/months";
import {
  describeAxis,
  deriveMonthAxis,
  foldDaysIntoBars,
  resolveAnalyticsRange,
  type AnalyticsRange,
} from "@/lib/analytics-range";
import { HEATMAP_WEEKS } from "@/lib/heatmap";
import { AnalyticsView } from "@/components/analytics-view";
import { TimezoneSync } from "@/components/timezone-sync";

/**
 * The whole analytics payload behind one boundary.
 *
 * The four tiles, the range chart, and the subject/topic panels are all derived
 * from the same window, and they cross-reference each other — the tiles summarise
 * the same days the chart draws, and the panels are scoped to the same range so
 * their totals agree with it. Splitting them would mean either repeating the
 * aggregations or rendering panels that briefly disagree with the chart above
 * them.
 *
 * The heatmap is the one exception, and it is a fourth query rather than a wider
 * version of the other three. It answers a different question on a different
 * timescale: the selected range describes a week, a month, a year or everything,
 * while the heatmap always describes the last 52 weeks. Its own header states its
 * own range so the two are never read as the same dataset.
 */
export async function AnalyticsStream({ range }: { range: AnalyticsRange }) {
  const user = await requireUser();
  const timeZone = await getUserTimeZone();

  const reference = new Date();
  const spec = resolveAnalyticsRange(range, reference, timeZone);
  // `to` is always present; only all-time leaves `from` open. Spreading rather
  // than passing `spec` whole is deliberate — `startedAtInRange` reads `undefined`
  // as "unbounded", and handing it the `axis` would be meaningless to it.
  const rangeFilter = { from: spec.from, to: spec.to };

  // A separate range object, built from the same `reference` and `timeZone` so
  // the two cannot disagree about where "now" is. Sharing the selected range here
  // would be the ISSUES.md #2 bug with a year's worth of cells behind it.
  const heatmap = getHeatmapRange(reference, timeZone, HEATMAP_WEEKS);

  const [days, subjectMetrics, topicMetrics, heatmapMetrics] = await Promise.all([
    getDailyFocus(user.id, rangeFilter, timeZone),
    getSubjectAnalytics(user.id, rangeFilter),
    getTopicAnalytics(user.id, rangeFilter),
    getHeatmapAnalytics(
      user.id,
      { from: heatmap.from, to: heatmap.to },
      timeZone
    ),
  ]);

  // All-time is the one axis that cannot exist before the history is read — it is
  // months from the user's first session, and the server cannot guess where that
  // is. Everything else has its axis from the spec.
  const axis =
    spec.axis ?? deriveMonthAxis(days, formatDateInZone(reference, timeZone));
  const bars = foldDaysIntoBars(days, axis, spec.unit);

  // Totals come off the bars rather than off the days, so a session that fell
  // outside the bar axis could never be counted in the headline while being
  // invisible in the chart under it. The two cannot disagree.
  const totalSeconds = bars.reduce((sum, bar) => sum + bar.durationSeconds, 0);
  const totalSessions = bars.reduce((sum, bar) => sum + bar.sessionCount, 0);
  const avgSessionSeconds =
    totalSessions > 0 ? Math.round(totalSeconds / totalSessions) : 0;

  return (
    <>
      {/* Every number on this page is bucketed by the user's zone, so a first
          visit rendered in the server's fallback zone needs one re-render. */}
      <TimezoneSync serverTimeZone={timeZone} />
      <AnalyticsView
        bars={bars}
        axisCaption={describeAxis(axis, spec.unit)}
        range={range}
        subjectMetrics={subjectMetrics}
        topicMetrics={topicMetrics}
        totalSeconds={totalSeconds}
        totalSessions={totalSessions}
        avgSessionSeconds={avgSessionSeconds}
        longestDayLabel={longestDayLabel(days, range)}
        heatmapColumns={heatmap.columns}
        heatmapMetrics={heatmapMetrics}
        heatmapToday={heatmap.today}
        heatmapWeeks={HEATMAP_WEEKS}
      />
    </>
  );
}

/**
 * The single day with the most focus time, named the way the chart names days.
 *
 * Taken from the sparse days rather than from the bars, because a bar is a week
 * or a month in every range but the weekly one — "Longest day: Sep 20" would be a
 * lie about a bar that covers seven days.
 *
 * The week view prints the weekday, because the seven bars beneath it are
 * already labelled with those and the tile should be readable as "the same
 * Wednesday". Wider ranges need the date, or "Wed" three months apart is three
 * different days wearing one name.
 */
function longestDayLabel(
  days: { date: string; durationSeconds: number }[],
  range: AnalyticsRange
): string {
  let best: { date: string; durationSeconds: number } | undefined;
  for (const day of days) {
    if (!best || day.durationSeconds > best.durationSeconds) best = day;
  }
  if (!best) return "";

  if (range === "week") {
    const weekday = new Date(`${best.date}T00:00:00.000Z`).getUTCDay();
    return WEEKDAY_LABELS[weekday];
  }
  return formatDayInMonth(best.date);
}