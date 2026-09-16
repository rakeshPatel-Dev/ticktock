"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Timer,
  History,
  BarChart3,
  Settings,
  HelpCircle,
} from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold tracking-tight text-foreground transition-opacity hover:opacity-90"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background">
              <Timer className="h-4 w-4" />
            </div>
            <span className="text-base font-bold tracking-tight">TickTock</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden sm:flex items-center gap-1">
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
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
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
        <div className="flex items-center gap-1.5">
          {/* Shortcuts Dialog */}
          <Dialog>
            <DialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title="Keyboard shortcuts (?)"
                >
                  <HelpCircle className="h-4 w-4" />
                  <span className="sr-only">Keyboard shortcuts</span>
                </Button>
              }
            />
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold">
                  Keyboard Shortcuts
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2.5 text-sm pt-2">
                <div className="flex items-center justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Start session</span>
                  <kbd className="rounded bg-muted px-2 py-0.5 text-xs font-mono font-medium border border-border">
                    S
                  </kbd>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">
                    Pause / Resume timer
                  </span>
                  <kbd className="rounded bg-muted px-2 py-0.5 text-xs font-mono font-medium border border-border">
                    Space
                  </kbd>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Finish session</span>
                  <kbd className="rounded bg-muted px-2 py-0.5 text-xs font-mono font-medium border border-border">
                    F
                  </kbd>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Close modal</span>
                  <kbd className="rounded bg-muted px-2 py-0.5 text-xs font-mono font-medium border border-border">
                    Esc
                  </kbd>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <ThemeToggle />
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="sm:hidden flex border-t border-border/50 bg-background/95 backdrop-blur px-2 py-1 justify-around">
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
                "flex flex-col items-center gap-0.5 py-1 px-3 text-[10px] font-medium rounded-md transition-colors",
                isActive
                  ? "text-foreground font-semibold"
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
