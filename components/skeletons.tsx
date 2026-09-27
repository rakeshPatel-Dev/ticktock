import { cn } from "@/lib/utils";

/**
 * Skeletons for the streaming fallbacks in `app/*\/page.tsx`.
 *
 * Deliberately NOT page-shaped. An earlier pass rebuilt the whole layout in
 * placeholder blocks — card frames, section headings, the label above every
 * number — and that was the wrong instinct twice over. It duplicated the static
 * markup in a second place that then had to be kept in sync, and it made every
 * navigation flash a page full of grey rectangles before the real thing
 * appeared, which reads as *slower* than a small honest placeholder even though
 * the bytes arrive sooner.
 *
 * The rule these follow: a skeleton marks a slot whose contents are about to be
 * replaced, and nothing else. Headings, labels, card frames and section titles
 * are known at build time and are rendered for real, immediately, in the static
 * shell — so this file only ever covers the numbers, the bars and the rows.
 *
 * Server Components on purpose: static markup, so none of it ships in the client
 * bundle. Each fallback is part of its route's static shell, arrives on the
 * first flush, and is already on screen when the real content streams over it.
 */

function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden
      style={style}
      className={cn("animate-pulse rounded-full bg-muted", className)}
    />
  );
}

/**
 * A value about to be replaced by text of roughly this size.
 *
 * `lines` stacks several, for a list of values. The width is deliberately not
 * fixed: these are labels' worth of content, and a placeholder that is a
 * different width from its replacement is what causes the jump.
 */
export function ValueSkeleton({
  className,
  lines = 1,
  width = "w-24",
}: {
  className?: string;
  lines?: number;
  width?: string;
}) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("flex flex-col gap-2", className)}
    >
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn("h-8 sm:h-9 !rounded-lg", width, i > 0 && "!h-6 sm:!h-7")}
        />
      ))}
    </div>
  );
}

/** The dashboard's Timer region: the clock, or the idle card's focal point. */
export function TimerSkeleton() {
  return (
    <div className="w-full" role="status" aria-label="Loading timer">
      <div className="rounded-4xl border border-border/50 bg-card p-6 sm:p-10 lg:p-14 text-center [box-shadow:var(--shadow-card),inset_0_1px_0_oklch(1_0_0_/_0.6)]">
        <div className="relative space-y-6 max-w-xl mx-auto">
          <Skeleton className="mx-auto mb-1 h-28 w-28 sm:h-40 sm:w-40 !rounded-3xl" />
          <Skeleton className="mx-auto h-9 sm:h-12 w-3/4 max-w-sm" />
          <Skeleton className="mx-auto h-11 w-40 !rounded-full" />
        </div>
      </div>
    </div>
  );
}

/**
 * A stat tile: the label is static, the number is not.
 *
 * The label is repeated here as real text rather than covered by a block,
 * because the tile reads as a labelled figure and a grey bar where "FOCUSED"
 * belongs makes the whole grid look broken. The duplication is deliberate and
 * bounded — four short strings — and it goes stale for the ~200ms the real
 * value takes to arrive, which is cheaper than a page of placeholders.
 */
function StatTileSkeleton({ label, width }: { label: string; width: string }) {
  return (
    <div className="rounded-4xl border border-border/40 bg-card p-5 sm:p-6 [box-shadow:var(--shadow-card),inset_0_1px_0_oklch(1_0_0_/_0.55)]">
      <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="mt-2">
        <Skeleton className={cn("h-9 sm:h-10 !rounded-lg", width)} />
      </div>
    </div>
  );
}

/**
 * Today's numbers: the day's total, the four tiles, and the recent rows.
 *
 * The tile labels above are rendered for real. Only the figures they sit above,
 * the goal total and the session rows are placeholders.
 */
export function SummarySkeleton() {
  return (
    <div className="space-y-8 w-full" role="status" aria-label="Loading today">
      <div className="rounded-4xl border border-border/40 bg-card p-5 sm:p-6 [box-shadow:var(--shadow-card),inset_0_1px_0_oklch(1_0_0_/_0.55)]">
        <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Today&apos;s Goal
        </span>
        <div className="mt-2 flex flex-row items-center justify-between gap-4">
          <Skeleton className="h-9 sm:h-10 w-48 !rounded-lg" />
          <Skeleton className="h-6 w-12" />
        </div>
        <div className="mt-4 space-y-2.5">
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <StatTileSkeleton label="Focused" width="w-24" />
        <StatTileSkeleton label="Sessions" width="w-16" />
        <StatTileSkeleton label="Subjects" width="w-16" />
        <StatTileSkeleton label="Longest" width="w-20" />
      </div>

      <div className="space-y-3.5">
        <ValueSkeleton className="px-1" width="w-full" lines={3} />
      </div>
    </div>
  );
}

/** The analytics tiles, the week chart's bars, and the two panels' rows. */
export function AnalyticsSkeleton() {
  return (
    <div className="space-y-8 pb-12" role="status" aria-label="Loading analytics">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <StatTileSkeleton label="This Week" width="w-24" />
        <StatTileSkeleton label="Sessions" width="w-16" />
        <StatTileSkeleton label="Average" width="w-20" />
        <StatTileSkeleton label="Longest Day" width="w-20" />
      </div>

      <div className="rounded-4xl border border-border/60 bg-card/50 p-5 sm:p-6">
        <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end h-44">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton
              key={i}
              className="w-full !rounded-t-lg !rounded-b-none"
              // Staggered so the fallback reads as a bar chart, not a picket fence.
              style={{ height: `${[45, 70, 30, 85, 55, 40, 25][i]}%` }}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2">
        {Array.from({ length: 2 }, (_, p) => (
          <div
            key={p}
            className="rounded-4xl border border-border/60 bg-card/40 p-5 sm:p-6 space-y-3"
          >
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The session rows only.
 *
 * The search field and both filter dropdowns are static, client-side controls
 * that work before any data exists, so the page renders them for real; a
 * skeleton over the whole region would have hidden controls the user can
 * legitimately click immediately.
 */
export function SessionsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading sessions">
      <div className="space-y-2">
        <ValueSkeleton width="w-full" lines={4} />
      </div>
    </div>
  );
}

/** Settings: the daily-goal value and the account field are the dynamic parts. */
export function SettingsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading settings">
      {Array.from({ length: 2 }, (_, i) => (
        <div
          key={i}
          className="rounded-4xl border border-border/60 bg-card/40 p-5 sm:p-6 space-y-3"
        >
          <ValueSkeleton width={i === 0 ? "w-40" : "w-56"} />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}
