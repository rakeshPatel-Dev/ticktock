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

export function SettingsView() {
  const { theme, setTheme } = useTheme();
  const [dailyGoal, setDailyGoal] = React.useState("4");
  const [savedGoal, setSavedGoal] = React.useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = React.useState(false);
  const [resetConfirmText, setResetConfirmText] = React.useState("");
  const [isResetting, setIsResetting] = React.useState(false);
  const [resetSuccess, setResetSuccess] = React.useState(false);

  React.useEffect(() => {
    const stored = localStorage.getItem("ticktock_daily_goal_hours");
    if (stored) {
      setDailyGoal(stored);
    }
  }, []);

  const handleSaveGoal = () => {
    const val = parseFloat(dailyGoal);
    if (isNaN(val) || val <= 0) return;
    localStorage.setItem("ticktock_daily_goal_hours", val.toString());
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
    <div className="space-y-6 max-w-2xl mx-auto pb-12">
      {/* General Preferences */}
      <Card className="border-border/60 bg-card/50 rounded-4xl shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">General</CardTitle>
          <CardDescription className="text-xs">
            Configure your personal tracking preferences.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Daily Goal */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-b border-border/40 pb-4">
            <div className="space-y-0.5">
              <label className="text-sm font-medium text-foreground">
                Daily Focus Goal
              </label>
              <p className="text-xs text-muted-foreground">
                Target hours of focused study per day.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0.5"
                max="24"
                step="0.5"
                value={dailyGoal}
                onChange={(e) => setDailyGoal(e.target.value)}
                className="w-20 font-mono text-center rounded-full"
              />
              <span className="text-xs text-muted-foreground font-medium">hours</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveGoal}
                className="gap-1.5 rounded-full"
              >
                {savedGoal ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    Saved
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </div>

          {/* Theme */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <div className="space-y-0.5">
              <label className="text-sm font-medium text-foreground">
                Appearance
              </label>
              <p className="text-xs text-muted-foreground">
                Choose light, dark, or follow system theme.
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-muted/60 p-1.5 rounded-full border border-border/50">
              <Button
                variant={theme === "light" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setTheme("light")}
                className="h-8 px-3 text-xs gap-1.5 rounded-full"
              >
                <Sun className="h-3.5 w-3.5 text-amber-500" /> Light
              </Button>
              <Button
                variant={theme === "dark" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setTheme("dark")}
                className="h-8 px-3 text-xs gap-1.5 rounded-full"
              >
                <Moon className="h-3.5 w-3.5 text-sky-500" /> Dark
              </Button>
              <Button
                variant={theme === "system" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setTheme("system")}
                className="h-8 px-3 text-xs gap-1.5 rounded-full"
              >
                <Laptop className="h-3.5 w-3.5" /> System
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Export & Portability */}
      <Card className="border-border/60 bg-card/50 rounded-4xl shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Data Export</CardTitle>
          <CardDescription className="text-xs">
            Your data belongs to you. Export your complete session logs anytime.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
            <a href="/api/export?format=json" download className="flex-1">
              <Button variant="outline" className="w-full justify-center gap-2 text-xs rounded-full">
                <FileJson className="h-4 w-4 text-sky-500" />
                Export as JSON
              </Button>
            </a>
            <a href="/api/export?format=csv" download className="flex-1">
              <Button variant="outline" className="w-full justify-center gap-2 text-xs rounded-full">
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
          <CardTitle className="text-base font-semibold text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Danger Zone
          </CardTitle>
          <CardDescription className="text-xs">
            Permanently clear all recorded sessions. This action cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {resetSuccess && (
            <div className="mb-3 p-2.5 text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-500/20 font-medium">
              All session data has been completely erased.
            </div>
          )}

          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsResetDialogOpen(true)}
            className="gap-2 text-xs rounded-full"
          >
            <Trash2 className="h-3.5 w-3.5" />
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
