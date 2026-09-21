"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useId } from "react";
import { LogOut, UserRound, KeyRound, Check } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  changePasswordAction,
  logoutAction,
  updateUsernameAction,
} from "@/lib/auth-actions";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="rounded-full min-w-28">
      {pending ? pendingLabel : label}
    </Button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="p-3 text-sm rounded-2xl bg-destructive/10 text-destructive font-medium border border-destructive/20"
    >
      {message}
    </div>
  );
}

function FieldSuccess({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="p-3 text-sm rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-500/20 flex items-center gap-2">
      <Check className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

export function AccountCard({ username }: { username: string }) {
  const [usernameState, usernameAction] = useActionState(
    updateUsernameAction,
    undefined
  );
  const [passwordState, passwordAction] = useActionState(
    changePasswordAction,
    undefined
  );
  const [signingOut, setSigningOut] = React.useState(false);

  const usernameId = useId();
  const currentPasswordId = useId();
  const newPasswordId = useId();
  const confirmPasswordId = useId();

  const handleSignOut = async () => {
    setSigningOut(true);
    await logoutAction();
  };

  return (
    <Card className="border-border/60 bg-card/50 rounded-4xl shadow-xs">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg sm:text-xl font-bold flex items-center gap-2">
          <div className="p-1 rounded-full bg-sky-500/10 text-sky-500">
            <UserRound className="h-5 w-5" />
          </div>
          Account
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Manage your username, password, and sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Username */}
        <form
          action={usernameAction}
          className="space-y-3 pt-1 border-b border-border/40 pb-5"
        >
          <FieldError message={usernameState?.error} />
          <FieldSuccess message={usernameState?.success} />
          <div className="space-y-1.5">
            <label htmlFor={usernameId} className="text-sm font-semibold text-foreground">
              Username
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Input
                id={usernameId}
                name="username"
                defaultValue={username}
                autoComplete="username"
                required
                className="h-10 rounded-full text-base"
              />
              <SubmitButton label="Update username" pendingLabel="Saving..." />
            </div>
            <p className="text-xs text-muted-foreground">
              3–30 characters. Letters, numbers, dots, dashes and underscores.
            </p>
          </div>
        </form>

        {/* Password */}
        <form
          action={passwordAction}
          className="space-y-3 pt-1 border-b border-border/40 pb-5"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-base font-semibold text-foreground">Change password</h3>
          </div>
          <FieldError message={passwordState?.error} />
          <FieldSuccess message={passwordState?.success} />
          <div className="grid sm:grid-cols-3 gap-2">
            <div className="space-y-1.5 sm:col-span-1">
              <label htmlFor={currentPasswordId} className="text-xs font-semibold text-foreground">
                Current password
              </label>
              <Input
                id={currentPasswordId}
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                required
                className="h-10 rounded-full"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <label htmlFor={newPasswordId} className="text-xs font-semibold text-foreground">
                New password
              </label>
              <Input
                id={newPasswordId}
                name="newPassword"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                required
                className="h-10 rounded-full"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <label htmlFor={confirmPasswordId} className="text-xs font-semibold text-foreground">
                Confirm new password
              </label>
              <Input
                id={confirmPasswordId}
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Re-enter new password"
                required
                className="h-10 rounded-full"
              />
            </div>
          </div>
          <div>
            <SubmitButton label="Update password" pendingLabel="Updating..." />
          </div>
        </form>

        {/* Sign out */}
        <div className="pt-1">
          <Button
            variant="outline"
            onClick={handleSignOut}
            disabled={signingOut}
            className="gap-2 text-sm font-semibold rounded-full h-11 px-5"
          >
            <LogOut className="h-4 w-4" />
            {signingOut ? "Signing out..." : "Sign out"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}