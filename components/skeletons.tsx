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
 * What they do have to match is the *shape* of what replaces them: same grid,
 * same row heights, same column count. A skeleton that is a different size from
 * its replacement is a layout shift, which is a worse jank than a placeholder.
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
      className={cn("animate-pulse rounded-md bg-muted", className)}
    />
  );
}

/** The dashboard's Timer region: the clock, or the idle hero's focal point. */
export function TimerSkeleton() {
  return (
    <div className="w-full" role="status" aria-label="Loading timer">
      <div className="rounded-4xl border border-border bg-card px-6 py-10 text-center [box-shadow:var(--shadow-raised)] sm:px-10 sm:py-14">
        <div className="@container relative mx-auto w-full max-w-xl">
          <Skeleton className="mx-auto h-16 w-[min(80%,22rem)] sm:h-24" />
          <Skeleton className="mx-auto mt-8 h-4 w-40" />
          <Skeleton className="mx-auto mt-6 h-11 w-36" />
        </div>
      </div>
    </div>
  );
}

/**
 * A stat figure. The label is static, the number is not.
 *
 * The label is repeated here as real text rather than covered by a block,
 * because the tile reads as a labelled figure and a grey bar where "FOCUSED"
 * belongs makes the whole grid look broken. The duplication is deliberate and
 * bounded — four short strings — and it goes stale for the ~200ms the real
 * value takes to arrive, which is cheaper than a page of placeholders.
 */
function StatFigureSkeleton({ label, width }: { label: string; width: string }) {
  return (
    <div className="min-w-0">
      <span className="type-label">{label}</span>
      <div className="mt-2">
        <Skeleton className={cn("h-6 w-20", width)} />
      </div>
    </div>
  );
}

/**
 * The four-figure strip, in the same grid and with the same hairlines as the
 * real thing. Two-up on phones, four-up from `sm`.
 */
function StatsStripSkeleton({ labels }: { labels: [string, string, string, string] }) {
  return (
    <div className="grid grid-cols-2 gap-y-5 sm:grid-cols-4 sm:gap-y-0">
      {labels.map((label, i) => (
        <div
          key={label}
          className={cn(
            "min-w-0",
            i % 2 === 1 && "border-l border-border pl-5",
            i > 0 && "sm:border-l sm:border-border sm:pl-5"
          )}
        >
          <StatFigureSkeleton label={label} width="w-20" />
        </div>
      ))}
    </div>
  );
}

/** A rounded surface the size of a real card, for regions with rows in them. */
function CardSkeleton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-4xl border border-border bg-card p-5 [box-shadow:var(--shadow-card)]", className)}>
      {children}
    </div>
  );
}

/**
 * Today's numbers: the day's total, the four figures, and the recent rows.
 *
 * The labels above the figures are rendered for real. Only the figures they sit
 * above, the goal total and the session rows are placeholders.
 */
export function SummarySkeleton() {
  return (
    <div className="space-y-4 w-full" role="status" aria-label="Loading today">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <CardSkeleton>
          <span className="type-label">Today&apos;s goal</span>
          <div className="mt-2.5">
            <Skeleton className="h-8 w-32" />
          </div>
          <div className="mt-5 space-y-2.5">
            <Skeleton className="h-1.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        </CardSkeleton>

        <CardSkeleton className="sm:w-[22rem]">
          <StatsStripSkeleton labels={["Focused", "Sessions", "Subjects", "Longest"]} />
        </CardSkeleton>
      </div>

      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
          <div className="divide-y divide-border/70 overflow-hidden rounded-4xl border border-border bg-card [box-shadow:var(--shadow-card)]">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3.5">
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-3.5 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The analytics strip, the week chart's bars, and the two panels' rows. */
export function AnalyticsSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading analytics">
      <CardSkeleton>
        <StatsStripSkeleton
          labels={["This week", "Sessions", "Avg session", "Longest day"]}
        />
      </CardSkeleton>

      <CardSkeleton>
        <Skeleton className="h-4 w-32" />
        <div className="mt-6 flex h-44 items-end gap-2 sm:gap-4">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton
              key={i}
              className="flex-1 rounded-t-md"
              // Staggered so the fallback reads as a bar chart, not a picket fence.
              style={{ height: `${[45, 70, 30, 85, 55, 40, 25][i]}%` }}
            />
          ))}
        </div>
      </CardSkeleton>

      <CardSkeleton>
        <Skeleton className="h-4 w-36" />
        <div className="mt-6 grid grid-flow-col grid-rows-7 gap-1">
          {Array.from({ length: 49 }, (_, i) => (
            <Skeleton key={i} className="aspect-square h-3" />
          ))}
        </div>
      </CardSkeleton>

      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }, (_, p) => (
          <CardSkeleton key={p}>
            <Skeleton className="h-4 w-28" />
            <div className="mt-5 space-y-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3.5 w-14" />
                  </div>
                  <Skeleton className="h-1 w-full" />
                </div>
              ))}
            </div>
          </CardSkeleton>
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
      {Array.from({ length: 2 }, (_, g) => (
        <div key={g} className="space-y-2">
          <Skeleton className="h-3 w-24" />
        <div className="divide-y divide-border/70 overflow-hidden rounded-4xl border border-border bg-card [box-shadow:var(--shadow-card)]">
            {Array.from({ length: g === 0 ? 3 : 2 }, (_, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3.5">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-3.5 w-12" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Settings: the account field, the goal value, and the export buttons. */
export function SettingsSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading settings">
      {Array.from({ length: 3 }, (_, i) => (
        <CardSkeleton key={i}>
          <Skeleton className="h-4 w-28" />
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between gap-6">
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-9 w-20" />
            </div>
          </div>
        </CardSkeleton>
      ))}
    </div>
  );
}
