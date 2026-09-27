import {
  getAllSubjects,
  getSessionCount,
  getSessions,
  SESSION_HISTORY_LIMIT,
} from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { SessionListView } from "@/components/session-list";

/**
 * The sessions list behind one boundary.
 *
 * The filter row, the date group headers and the rows themselves are all
 * filtered from the same client-side array, so they cannot usefully stream
 * separately — a row that arrives before its filter state would be filtered
 * against the wrong list. One boundary, both reads in parallel.
 */
export async function SessionsStream() {
  const user = await requireUser();

  // One row more than we are willing to show. Its presence is the only honest
  // signal that the cap was reached; without it a truncated history is
  // indistinguishable from a complete one.
  const [fetched, subjects] = await Promise.all([
    getSessions(user.id, { limit: SESSION_HISTORY_LIMIT + 1 }),
    getAllSubjects(user.id),
  ]);

  const truncated = fetched.length > SESSION_HISTORY_LIMIT;
  const sessions = truncated ? fetched.slice(0, SESSION_HISTORY_LIMIT) : fetched;

  // Only worth a query when the cap actually bit.
  const totalCount = truncated ? await getSessionCount(user.id) : sessions.length;

  return (
    <>
      {truncated ? (
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-700 dark:text-amber-400">
          Showing the {SESSION_HISTORY_LIMIT} most recent of {totalCount}{" "}
          sessions. Narrow the search or date range to reach older ones.
        </p>
      ) : null}
      <SessionListView initialSessions={sessions} subjects={subjects} />
    </>
  );
}
