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
  { href: "/", label: "Dashboard", icon: Timer },
  { href: "/sessions", label: "Sessions", icon: History },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

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
    <header className="sticky top-3 z-40 w-full px-4 mb-2">
      <div className="container mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6 rounded-full border border-border/60 bg-background/85 backdrop-blur-xl [box-shadow:0_4px_16px_oklch(0_0_0_/_0.08),0_1px_4px_oklch(0_0_0_/_0.06),inset_0_1px_0_oklch(1_0_0_/_0.6)]">
        {/* Brand */}
        <div className="flex items-center gap-4 sm:gap-6">
          <Link
            href="/"
            className="flex items-center gap-2 font-bold tracking-tight text-foreground group transition-transform active:scale-95"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden shadow-md shadow-sky-500/40 group-hover:rotate-12 transition-transform">
              <Image src="/icon1.png" alt="TickTock" width={32} height={32} />
            </div>
            <span className="text-base font-extrabold tracking-tight text-foreground">
              TickTock
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden sm:flex items-center gap-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all active:scale-95",
                    isActive
                      ? "bg-foreground text-background shadow-xs font-bold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/70"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right side: Shortcut help & Theme toggle */}
        <div className="flex items-center gap-2">
          {/* Shortcuts Dialog */}
          <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
            <DialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hidden sm:inline-flex rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
                  title="Keyboard shortcuts (?)"
                >
                  <HelpCircle className="h-4 w-4" />
                  <span className="sr-only">Keyboard shortcuts</span>
                </Button>
              }
            />
            <DialogContent className="sm:max-w-md rounded-4xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <div className="p-1 rounded-full bg-amber-500/10 text-amber-500">
                    <HelpCircle className="h-4 w-4" />
                  </div>
                  Keyboard Shortcuts
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm pt-2">
                {SHORTCUTS.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                    <span className="text-muted-foreground font-medium">{s.action}</span>
                    <kbd className="rounded-full bg-muted px-3 py-1 text-xs font-mono font-bold border border-border shadow-2xs">
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

      {/* Mobile Bottom Navigation Bar */}
      <div className="sm:hidden fixed bottom-4 left-4 right-4 z-40 flex rounded-full border border-border/70 bg-background/90 backdrop-blur-xl px-3 py-1.5 justify-around shadow-xl">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 py-1 px-3 text-[11px] font-semibold rounded-full transition-all active:scale-95",
                isActive
                  ? "bg-foreground text-background shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
