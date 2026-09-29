import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * A surface, not an object.
 *
 * The old card carried three stacked shadows and an inset top highlight, and
 * lifted on hover — depth as decoration, applied uniformly, so nothing ever
 * read as being above anything. Depth is now a three-step ladder in
 * `globals.css` (`card`, `raised`, `float`) and this component takes the first
 * step. A card never lifts on hover, because a card is a place, not a control;
 * `raised` is for the one surface on a screen that is the subject.
 */
function Card({
  className,
  size = "default",
  raised = false,
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm"; raised?: boolean }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-raised={raised || undefined}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-4xl border border-border/70 bg-card py-(--card-spacing) text-sm text-card-foreground [--card-spacing:--spacing(5)] [box-shadow:var(--shadow-card)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(4)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 data-[raised]:[box-shadow:var(--shadow-raised)] *:[img:first-child]:rounded-t-4xl *:[img:last-child]:rounded-b-4xl",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1.5 rounded-t-4xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "type-heading group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-[13px] leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-4xl border-t bg-muted/40 px-(--card-spacing) py-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
