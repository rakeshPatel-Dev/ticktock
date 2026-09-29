"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

function useMounted() {
  return React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

/**
 * The one place the light/dark decision is made.
 *
 * The navbar binds T to this, and the button calls it, so the two cannot
 * disagree about what the next theme is. `theme` is undefined until
 * next-themes has read storage, so we fall back to the resolved value and only
 * ever write an explicit "light" or "dark".
 */
export function useThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useMounted();

  const isDark = (theme === "system" || !theme ? resolvedTheme : theme) === "dark";

  const toggleTheme = React.useCallback(() => {
    setTheme(isDark ? "light" : "dark");
  }, [isDark, setTheme]);

  return { mounted, isDark, toggleTheme };
}

export function ThemeToggle() {
  const { mounted, isDark, toggleTheme } = useThemeToggle();

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground hover:text-foreground"
      onClick={toggleTheme}
      title={`Switch to ${isDark ? "light" : "dark"} mode (T)`}
    >
      {isDark ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
