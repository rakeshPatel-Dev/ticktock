"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Timer,
  History,
  BarChart3,
  Settings,
  HelpCircle,
} from "lucide-react";
import { ThemeToggle, useThemeToggle } from "./theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SHORTCUTS, getShortcut, isEditableTarget, matchesShortcut } from "@/lib/shortcuts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const navItems = [
  { href: "/", label: "Focus", icon: Timer },
  { href: "/sessions", label: "Sessions", icon: History },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isNavItemActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Navbar() {
  const pathname = usePathname();
  const { toggleTheme } = useThemeToggle();
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);

  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/signup");

  // App-level bindings, so the theme shortcut and the help dialog work on every
  // page rather than only where the timer happens to be mounted. The timer owns
  // its own listener for the session keys; the two never match the same key.
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e)) return;

      if (matchesShortcut(getShortcut("toggleTheme"), e)) {
        e.preventDefault();
        toggleTheme();
        return;
      }

      if (matchesShortcut(getShortcut("showShortcuts"), e)) {
        e.preventDefault();
        setShortcutsOpen((open) => !open);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleTheme]);

  if (isAuthRoute) return null;

  return (
    <>
      {/*
        A bar, not a floating pill. The previous header was a 56px rounded
        capsule floating 12px off the top of the page, which pushed content down
        and read as a widget. This one is flush, full-width, and separated from
        the page by a single hairline — the separation is enough.
      */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-[52px] w-full max-w-5xl items-center justify-between px-5 sm:px-6">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-2 transition-opacity hover:opacity-70"
            >
              <Image src="/icon1.png" alt="" width={26} height={26} className="size-6 rounded-[6px]" />
              <span className="text-[15px] font-bold tracking-[-0.01em] text-foreground">
                TickTock
              </span>
            </Link>

            {/* Segmented navigation. The active item is a neutral fill, not an
                inverted one — inverting made a tab look like a button that was
                pressed, which competes with the real primary action on the page. */}
            <nav className="hidden items-center gap-1 rounded-full bg-muted/70 p-1 border border-border/60 shadow-inner backdrop-blur-xl sm:flex">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = isNavItemActive(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition-all duration-200",
                      isActive
                        ? "bg-primary text-primary-foreground font-semibold shadow-[0_2px_12px_-2px_color-mix(in_oklch,var(--primary)_55%,transparent),inset_0_1px_0_rgba(255,255,255,0.25)]"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                    )}
                  >
                    <Icon className="size-3.5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-1">
            <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
              <DialogTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-foreground"
                    title="Keyboard shortcuts (?)"
                  >
                    <HelpCircle className="size-4" />
                    <span className="sr-only">Keyboard shortcuts</span>
                  </Button>
                }
              />
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Keyboard Shortcuts</DialogTitle>
                </DialogHeader>
                <div className="space-y-0.5 pt-1">
                  {SHORTCUTS.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between border-b border-border/70 py-2.5 last:border-0"
                    >
                      <span className="text-[13px] text-secondary-foreground">{s.action}</span>
                      <kbd className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[11px] font-medium text-foreground">
                        {s.label}
                      </kbd>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>

            <ThemeToggle />
          </div>
        </div>
      </header>

      {/*
        Mobile tab bar. A hairline top border and a backdrop, with the active
        item carrying the accent colour — the iOS convention, and the reason it
        needs no floating capsule to read as a bar.
      */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/90 backdrop-blur-2xl sm:hidden">
        <div className="flex items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = isNavItemActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-[3px] pt-2 pb-1 text-[10px] font-medium transition-all duration-150",
                  isActive ? "text-primary font-bold" : "text-muted-foreground/70 hover:text-foreground"
                )}
              >
                <span className={cn(
                  "flex size-[44px] items-center justify-center rounded-full transition-all duration-200",
                  isActive ? "bg-primary/15 text-primary border border-primary/25 shadow-[0_0_16px_color-mix(in_oklch,var(--primary)_40%,transparent)]" : ""
                )}>
                  <Icon className={cn("transition-all duration-200", isActive ? "size-[22px] drop-shadow-[0_0_8px_color-mix(in_oklch,var(--primary)_70%,transparent)]" : "size-[20px]")} />
                </span>
                <span className={isActive ? "font-bold text-primary" : ""}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
