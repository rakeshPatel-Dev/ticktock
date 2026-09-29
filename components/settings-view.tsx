"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  Trash2,
  Moon,
  Sun,
  Laptop,
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
import { cn } from "@/lib/utils";

/**
 * One row, label left, control right.
 *
 * A settings row is a definition list, not a card per setting — so the label is
 * the thing you read and the control is a fixed-width object on the right, and
 * a hairline separates rows instead of each one floating in its own frame.
 */
function SettingRow({
  label,
  labelId,
  description,
  children,
}: {
  label: string;
  /** Set when a control on the right is grouped by this row's label. */
  labelId?: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/60 py-4 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p id={labelId} className="text-[15px] font-medium text-foreground">
          {label}
        </p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

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

  const themes = [
    { value: "light", label: "Light", Icon: Sun },
    { value: "dark", label: "Dark", Icon: Moon },
    { value: "system", label: "System", Icon: Laptop },
  ] as const;

  return (
    <div className="space-y-4 w-full pb-4">
      <AccountCard username={username} />

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Your tracking preferences.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingRow
            label="Daily focus goal"
            description="Target hours of focused study per day."
          >
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
              className="w-20 font-mono text-center"
            />
            <span className="text-[13px] text-muted-foreground">hours</span>
            <Button variant="outline" onClick={handleSaveGoal}>
              {savedGoal ? (
                <>
                  <Check className="size-3.5 text-primary" />
                  Saved
                </>
              ) : (
                "Save"
              )}
            </Button>
          </SettingRow>

          {goalError && (
            <p id={goalErrorId} role="alert" className="pt-3 text-[13px] font-medium text-destructive">
              {goalError}
            </p>
          )}

          <div className="pt-5">
            <SettingRow
              label="Appearance"
              labelId={appearanceGroupId}
              description="Match your system, or pick one."
            >
              <div
                role="group"
                aria-labelledby={appearanceGroupId}
                className="flex items-center gap-0.5 rounded-full bg-muted/70 p-1"
              >
                {themes.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={theme === value}
                    onClick={() => setTheme(value)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all duration-200",
                      theme === value
                        ? "bg-primary text-primary-foreground font-semibold shadow-[0_2px_10px_-2px_color-mix(in_oklch,var(--primary)_50%,transparent),inset_0_1px_0_rgba(255,255,255,0.25)]"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/40"
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </SettingRow>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data export</CardTitle>
          <CardDescription>
            Your data belongs to you. Download your complete session log at any time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row">
            <a href="/api/export?format=json" download className="flex-1">
              <Button variant="outline" className="w-full">
                <FileJson className="size-4" />
                Export JSON
              </Button>
            </a>
            <a href="/api/export?format=csv" download className="flex-1">
              <Button variant="outline" className="w-full">
                <FileSpreadsheet className="size-4" />
                Export CSV
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/25">
        <CardHeader>
          <CardTitle className="text-destructive">Delete all data</CardTitle>
          <CardDescription>
            Permanently clear every recorded session. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {resetSuccess && (
            <p className="mb-3 rounded-lg border border-primary/20 bg-primary/8 px-3 py-2 text-[13px] font-medium text-primary">
              All session data has been erased.
            </p>
          )}

          <Button
            variant="outline"
            onClick={() => setIsResetDialogOpen(true)}
            className="border-destructive/30 text-destructive hover:bg-destructive/8 hover:text-destructive"
          >
            <Trash2 className="size-4" />
            Clear all data
          </Button>
        </CardContent>
      </Card>

      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all data</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              This permanently deletes every session record. To confirm, type{" "}
              <span className="font-mono text-foreground">delete all</span> below.
            </p>

            <Input
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="delete all"
              className="font-mono"
            />

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setIsResetDialogOpen(false);
                  setResetConfirmText("");
                }}
                disabled={isResetting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleResetData}
                disabled={resetConfirmText.toLowerCase() !== "delete all" || isResetting}
              >
                {isResetting ? "Deleting…" : "Delete everything"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
