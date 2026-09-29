import { cn } from "@/lib/utils";

/**
 * iOS Large Title treatment.
 *
 * iOS navigation bars use a large 34px bold title on initial load. On the web
 * we render it statically at the top of the content area rather than in the
 * nav bar, which is the same visual result without requiring scroll-linked
 * animation. The title is the first thing the eye lands on; the description
 * answers the implied question underneath it.
 */
export function PageHeader({
  title,
  description,
  className,
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={cn("pb-1", className)}>
      <h1 className="text-[32px] font-bold tracking-[-0.04em] text-foreground leading-tight">
        {title}
      </h1>
      <p className="mt-1 text-[15px] text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
