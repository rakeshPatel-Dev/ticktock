"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  Trash2,
  Moon,
  Sun,
  Laptop,
  AlertTriangle,
  FileJson,
  FileSpreadsheet,
  Check,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { clearAllSessions } from "@/lib/actions";
import {
  useDailyGoalHours,
  MAX_DAILY_GOAL_HOURS,
  MIN_DAILY_GOAL_HOURS,
  parseDailyGoalHours,
} from "@/lib/daily-goal";
import { AccountCard } from "@/components/account-card";

export function SettingsView({ username }: { username: string }) {
  const { theme, setTheme } = useTheme();
  // One source of truth for the goal, shared with the dashboard. The settings
  // form used to write `ticktock_daily_goal_hours` itself while the dashboard
  // never read it, so a saved goal did nothing anywhere.
  const { hours: savedGoalHours, setHours: saveDailyGoalHours } = useDailyGoalHours();
  const [dailyGoal, setDailyGoal] = React.useState(String(savedGoalHours));
  const [goalError, setGoalError] = React.useState<string | null>(null);
  const [savedGoal, setSavedGoal] = React.useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = React.useState(false);
  const [resetConfirmText, setResetConfirmText] = React.useState("");
  const [isResetting, setIsResetting] = React.useState(false);
  const [resetSuccess, setResetSuccess] = React.useState(false);
  const goalFieldId = React.useId();
  const goalErrorId = React.useId();
  const appearanceGroupId = React.useId();

  // Re-sync when the goal changes underneath this form (another tab saving it).
  // Typing is unaffected: the value only changes on a real save.
  React.useEffect(() => {
    setDailyGoal(String(savedGoalHours));
  }, [savedGoalHours]);

  const handleSaveGoal = () => {
    const parsed = parseDailyGoalHours(dailyGoal);
    if (parsed === null) {
      setGoalError(
        `Enter a number between ${MIN_DAILY_GOAL_HOURS} and ${MAX_DAILY_GOAL_HOURS} hours.`
      );
      return;
    }
    if (!saveDailyGoalHours(parsed)) {
      setGoalError("Could not save the goal. Browser storage may be blocked.");
      return;
    }
    setGoalError(null);
    setSavedGoal(true);
    setTimeout(() => setSavedGoal(false), 2000);
  };

  const handleResetData = async () => {
    if (resetConfirmText.toLowerCase() !== "delete all") return;
    setIsResetting(true);
    await clearAllSessions();
    setIsResetting(false);
    setIsResetDialogOpen(false);
    setResetConfirmText("");
    setResetSuccess(true);
    setTimeout(() => setResetSuccess(false), 3000);
  };

  return (
    <div className="space-y-6 w-full pb-12">
      {/* Account */}
      <AccountCard username={username} />

      {/* General Preferences */}
      <Card className="border-border/60 bg-card/50 rounded-4xl shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg sm:text-xl font-bold">General</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Configure your personal tracking preferences.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Daily Goal */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-b border-border/40 pb-4">
            <div className="space-y-0.5">
              <label htmlFor={goalFieldId} className="text-base font-semibold text-foreground">
                Daily Focus Goal
              </label>
              <p className="text-sm  mt-1 text-muted-foreground">
                Target hours of focused study per day.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <Input
                id={goalFieldId}
                type="number"
                inputMode="decimal"
                min={MIN_DAILY_GOAL_HOURS}
                max={MAX_DAILY_GOAL_HOURS}
                step="0.5"
                value={dailyGoal}
                onChange={(e) => {
                  setDailyGoal(e.target.value);
                  setGoalError(null);
                }}
                aria-invalid={goalError ? true : undefined}
                aria-describedby={goalError ? goalErrorId : undefined}
                className="w-24 font-mono text-center rounded-full text-base h-11 mt-1"
              />
              <span className="text-sm font-semibold text-muted-foreground">hours</span>
              <Button
                variant="outline"
                size="default"
                onClick={handleSaveGoal}
                className="gap-2 rounded-full font-semibold h-11 px-5"
              >
                {savedGoal ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-500" />
                    Saved
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </div>
          {goalError && (
            <p id={goalErrorId} role="alert" className="text-sm font-medium text-destructive">
              {goalError}
            </p>
          )}

          {/* Theme */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="space-y-0.5">
              <span
                id={appearanceGroupId}
                className="text-base font-semibold text-foreground"
              >
                Appearance
              </span>
              <p className="text-sm  mt-1 text-muted-foreground">
                Choose light, dark, or follow system theme.
              </p>
            </div>
            <div
              role="group"
              aria-labelledby={appearanceGroupId}
              className="flex items-center gap-1.5 bg-muted/60 p-1.5 rounded-full border border-border/50"
            >
              <Button
                variant={theme === "light" ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={theme === "light"}
                onClick={() => setTheme("light")}
                className="h-9 px-3.5 text-sm gap-2 rounded-full font-medium"
              >
                <Sun className="h-4 w-4 text-amber-500" /> Light
              </Button>
              <Button
                variant={theme === "dark" ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={theme === "dark"}
                onClick={() => setTheme("dark")}
                className="h-9 px-3.5 text-sm gap-2 rounded-full font-medium"
              >
                <Moon className="h-4 w-4 text-sky-500" /> Dark
              </Button>
              <Button
                variant={theme === "system" ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={theme === "system"}
                onClick={() => setTheme("system")}
                className="h-9 px-3.5 text-sm gap-2 rounded-full font-medium"
              >
                <Laptop className="h-4 w-4" /> System
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Export & Portability */}
      <Card className="border-border/60 bg-card/50 rounded-4xl shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg sm:text-xl font-bold">Data Export</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Your data belongs to you. Export your complete session logs anytime.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
            <a href="/api/export?format=json" download className="flex-1">
              <Button variant="outline" className="w-full justify-center gap-2 text-sm font-semibold rounded-full h-11">
                <FileJson className="h-4 w-4 text-sky-500" />
                Export as JSON
              </Button>
            </a>
            <a href="/api/export?format=csv" download className="flex-1">
              <Button variant="outline" className="w-full justify-center gap-2 text-sm font-semibold rounded-full h-11">
                <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                Export as CSV
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone: Reset Data */}
      <Card className="border-destructive/30 bg-destructive/5 rounded-4xl shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg sm:text-xl font-bold text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Permanently clear all recorded sessions. This action cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {resetSuccess && (
            <div className="mb-3.5 p-3 text-sm bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-500/20 font-medium">
              All session data has been completely erased.
            </div>
          )}

          <Button
            variant="destructive"
            size="default"
            onClick={() => setIsResetDialogOpen(true)}
            className="gap-2 text-sm font-semibold rounded-full h-11 px-5"
          >
            <Trash2 className="h-4 w-4" />
            Clear all data
          </Button>
        </CardContent>
      </Card>

      {/* Clear Data Confirmation Dialog */}
      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-4xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Confirm Data Reset
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              This will permanently delete all session records from your database.
              To confirm, please type <strong className="text-foreground">delete all</strong> below:
            </p>

            <Input
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="delete all"
              className="font-mono text-sm rounded-full"
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsResetDialogOpen(false);
                  setResetConfirmText("");
                }}
                disabled={isResetting}
                className="rounded-full"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleResetData}
                disabled={resetConfirmText.toLowerCase() !== "delete all" || isResetting}
                className="rounded-full"
              >
                {isResetting ? "Clearing..." : "Permanently Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
