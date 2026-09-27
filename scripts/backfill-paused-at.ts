import "./_load-env";

import { studySessions } from "../db";

/**
 * One-off backfill for the `pausedAt` field.
 *
 * Before `pausedAt` existed, `updatedAt` doubled as the pause-start anchor.
 * Sessions that are paused RIGHT NOW still have no `pausedAt`, so a resume or a
 * finish on them has to guess. The runtime shim in
 * `db/schema.ts#pauseAnchorSeconds` guesses `updatedAt` — which is correct for
 * an untouched row and silently wrong for a paused row that was edited. This
 * script pins the anchor for those rows so the guess stops mattering.
 *
 * Idempotent, and safe to re-run: it only touches documents that match.
 *   paused,  pausedAt missing -> pausedAt = updatedAt
 *   not paused, pausedAt set  -> pausedAt = null
 */
async function run() {
  const fromPaused = await studySessions.updateMany(
    { status: "paused", $or: [{ pausedAt: { $exists: false } }, { pausedAt: null }] },
    [{ $set: { pausedAt: "$updatedAt" } }]
  );

  const fromIdle = await studySessions.updateMany(
    {
      status: { $ne: "paused" },
      pausedAt: { $type: "date" },
    },
    [{ $set: { pausedAt: null } }]
  );

  console.log(
    `✓ pinned pause anchor on ${fromPaused.modifiedCount} paused session(s)`
  );
  console.log(
    `✓ cleared stale anchor on ${fromIdle.modifiedCount} non-paused session(s)`
  );

  const stillMissing = await studySessions.countDocuments({
    status: "paused",
    $or: [{ pausedAt: { $exists: false } }, { pausedAt: null }],
  });
  if (stillMissing > 0) {
    console.error(
      `✗ ${stillMissing} paused session(s) still have no anchor — rerun before resuming them.`
    );
    process.exit(1);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
