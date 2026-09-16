import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all duration-150 outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 active:brightness-95 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 [box-shadow:var(--shadow-btn)] hover:[box-shadow:var(--shadow-btn-hover)]",
        sky:
          "bg-sky-500 hover:bg-sky-600 text-white font-bold [box-shadow:0_2px_8px_theme(colors.sky.500/35%),var(--shadow-btn)] hover:[box-shadow:0_4px_16px_theme(colors.sky.500/45%),var(--shadow-btn-hover)]",
        orange:
          "bg-orange-500 hover:bg-orange-600 text-white font-bold [box-shadow:0_2px_8px_theme(colors.orange.500/35%),var(--shadow-btn)] hover:[box-shadow:0_4px_16px_theme(colors.orange.500/45%),var(--shadow-btn-hover)]",
        pink:
          "bg-pink-500 hover:bg-pink-600 text-white font-bold [box-shadow:0_2px_8px_theme(colors.pink.500/35%),var(--shadow-btn)] hover:[box-shadow:0_4px_16px_theme(colors.pink.500/45%),var(--shadow-btn-hover)]",
        red:
          "bg-red-500 hover:bg-red-600 text-white font-bold [box-shadow:0_2px_8px_theme(colors.red.500/35%),var(--shadow-btn)] hover:[box-shadow:0_4px_16px_theme(colors.red.500/45%),var(--shadow-btn-hover)]",
        amber:
          "bg-amber-500 hover:bg-amber-600 text-white font-bold [box-shadow:0_2px_8px_theme(colors.amber.500/35%),var(--shadow-btn)] hover:[box-shadow:0_4px_16px_theme(colors.amber.500/45%),var(--shadow-btn-hover)]",
        emerald:
          "bg-emerald-500 hover:bg-emerald-600 text-white font-bold [box-shadow:0_2px_8px_theme(colors.emerald.500/35%),var(--shadow-btn)] hover:[box-shadow:0_4px_16px_theme(colors.emerald.500/45%),var(--shadow-btn-hover)]",
        rose:
          "bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-500/30 font-bold [box-shadow:0_1px_4px_theme(colors.rose.500/15%)] hover:[box-shadow:0_2px_8px_theme(colors.rose.500/25%)]",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 [box-shadow:var(--shadow-btn)] hover:[box-shadow:var(--shadow-btn-hover)]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground [box-shadow:var(--shadow-btn)]",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 [box-shadow:0_2px_8px_theme(colors.red.600/35%),var(--shadow-btn)] hover:[box-shadow:0_4px_16px_theme(colors.red.600/45%),var(--shadow-btn-hover)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9.5 gap-2 px-4.5 rounded-full text-sm font-semibold",
        xs: "h-6 gap-1 rounded-full px-2.5 text-xs",
        sm: "h-8 gap-1.5 rounded-full px-3 text-xs font-medium",
        lg: "h-12 gap-2.5 px-6.5 text-base font-bold rounded-full hover:-translate-y-0.5",
        icon: "size-9 rounded-full",
        "icon-xs": "size-6 rounded-full [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7.5 rounded-full",
        "icon-lg": "size-10 rounded-full",
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
