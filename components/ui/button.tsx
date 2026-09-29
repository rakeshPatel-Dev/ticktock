import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * Six variants, one accent.
 *
 * The previous set had `sky`, `orange`, `pink`, `red`, `amber`, `emerald` and
 * `rose` — each with its own coloured glow — which meant a page of controls
 * competed with itself for attention. Emphasis is now a single filled button in
 * the accent; everything else steps down through outline to ghost. A screen
 * that needs six different buttons calling themselves out is a screen where
 * none of them do.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[background-color,color,border-color,box-shadow,transform,opacity] duration-100 outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.97] active:opacity-90 disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-primary via-primary to-[color-mix(in_oklch,var(--primary)_86%,black)] text-primary-foreground font-semibold shadow-[0_4px_16px_-2px_color-mix(in_oklch,var(--primary)_50%,transparent),0_1px_2px_color-mix(in_oklch,var(--primary)_30%,transparent),inset_0_1px_0_rgba(255,255,255,0.30)] hover:brightness-105 hover:shadow-[0_6px_22px_-2px_color-mix(in_oklch,var(--primary)_65%,transparent),0_2px_4px_color-mix(in_oklch,var(--primary)_35%,transparent)] active:scale-[0.96] active:brightness-95 active:shadow-[0_2px_8px_-1px_color-mix(in_oklch,var(--primary)_50%,transparent),inset_0_2px_4px_rgba(0,0,0,0.20)] dark:shadow-[0_4px_22px_-2px_color-mix(in_oklch,var(--primary)_60%,transparent),inset_0_1px_0_rgba(255,255,255,0.22)] dark:hover:shadow-[0_6px_28px_-2px_color-mix(in_oklch,var(--primary)_75%,transparent)]",
        secondary:
          "bg-primary/10 text-primary border border-primary/20 shadow-xs hover:bg-primary/18 hover:border-primary/30 hover:shadow-[0_2px_12px_color-mix(in_oklch,var(--primary)_25%,transparent)] dark:bg-primary/15 dark:border-primary/25 dark:hover:bg-primary/25",
        outline:
          "border-border/80 bg-card/70 backdrop-blur-md shadow-[0_1px_2px_oklch(0_0_0/0.05)] hover:border-primary/40 hover:bg-primary/8 hover:text-primary hover:shadow-[0_2px_12px_color-mix(in_oklch,var(--primary)_18%,transparent)] dark:bg-card/40 dark:hover:border-primary/50 dark:hover:bg-primary/15",
        ghost:
          "hover:bg-primary/10 hover:text-primary active:bg-primary/15",
        destructive:
          "bg-gradient-to-b from-destructive to-[color-mix(in_oklch,var(--destructive)_86%,black)] text-white font-semibold shadow-[0_4px_16px_-2px_color-mix(in_oklch,var(--destructive)_45%,transparent),inset_0_1px_0_rgba(255,255,255,0.25)] hover:brightness-105 hover:shadow-[0_6px_20px_-2px_color-mix(in_oklch,var(--destructive)_60%,transparent)] active:scale-[0.96]",
        link: "text-primary underline-offset-4 hover:underline hover:brightness-110",
      },
      size: {
        default: "h-10 gap-2 px-5",
        xs: "h-6 gap-1 px-2.5 text-xs",
        sm: "h-8 gap-1.5 px-3.5 text-[13px]",
        lg: "h-[50px] gap-2 px-7 text-[15px]",
        icon: "size-10",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
