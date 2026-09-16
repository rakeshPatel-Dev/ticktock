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
    <header className="sticky top-3 z-40 w-full px-4 mb-2">
      <div className="container mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-5 rounded-full border border-border/80 bg-background/80 backdrop-blur-xl shadow-md">
        {/* Brand */}
        <div className="flex items-center gap-4 sm:gap-6">
          <Link
            href="/"
            className="flex items-center gap-2 font-bold tracking-tight text-foreground group transition-transform active:scale-95"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500 text-white shadow-sm shadow-sky-500/25 group-hover:rotate-12 transition-transform">
              <Timer className="h-4 w-4" />
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
          <Dialog>
            <DialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
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
                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground font-medium">Start session</span>
                  <kbd className="rounded-full bg-muted px-3 py-1 text-xs font-mono font-bold border border-border shadow-2xs">
                    S
                  </kbd>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground font-medium">
                    Pause / Resume timer
                  </span>
                  <kbd className="rounded-full bg-muted px-3 py-1 text-xs font-mono font-bold border border-border shadow-2xs">
                    Space
                  </kbd>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground font-medium">Finish session</span>
                  <kbd className="rounded-full bg-muted px-3 py-1 text-xs font-mono font-bold border border-border shadow-2xs">
                    F
                  </kbd>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground font-medium">Close modal</span>
                  <kbd className="rounded-full bg-muted px-3 py-1 text-xs font-mono font-bold border border-border shadow-2xs">
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
