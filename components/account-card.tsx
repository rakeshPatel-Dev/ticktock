"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useId } from "react";
import { LogOut, Check } from "lucide-react";
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
    <Button type="submit" disabled={pending} variant="outline" className="shrink-0">
      {pending ? pendingLabel : label}
    </Button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2 text-[13px] font-medium text-destructive"
    >
      {message}
    </p>
  );
}

function FieldSuccess({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="flex items-center gap-1.5 text-[13px] font-medium text-primary">
      <Check className="size-3.5 shrink-0" />
      {message}
    </p>
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
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Your username, password, and sign-in.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form action={usernameAction} className="space-y-2.5">
          <FieldError message={usernameState?.error} />
          <FieldSuccess message={usernameState?.success} />
          <label
            htmlFor={usernameId}
            className="block text-[13px] font-medium text-foreground"
          >
            Username
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={usernameId}
              name="username"
              defaultValue={username}
              autoComplete="username"
              required
            />
            <SubmitButton label="Update" pendingLabel="Saving…" />
          </div>
          <p className="text-[12px] text-muted-foreground">
            3–30 characters. Letters, numbers, dots, dashes and underscores.
          </p>
        </form>

        <form action={passwordAction} className="space-y-2.5 border-t border-border/70 pt-6">
          <FieldError message={passwordState?.error} />
          <FieldSuccess message={passwordState?.success} />
          <label className="block text-[13px] font-medium text-foreground">
            Change password
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label
                htmlFor={currentPasswordId}
                className="block text-[12px] text-muted-foreground"
              >
                Current
              </label>
              <Input
                id={currentPasswordId}
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor={newPasswordId}
                className="block text-[12px] text-muted-foreground"
              >
                New
              </label>
              <Input
                id={newPasswordId}
                name="newPassword"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor={confirmPasswordId}
                className="block text-[12px] text-muted-foreground"
              >
                Confirm
              </label>
              <Input
                id={confirmPasswordId}
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Re-enter new password"
                required
              />
            </div>
          </div>
          <div className="pt-1">
            <SubmitButton label="Update password" pendingLabel="Updating…" />
          </div>
        </form>

        <div className="border-t border-border/70 pt-6">
          <Button
            variant="ghost"
            onClick={handleSignOut}
            disabled={signingOut}
            className="-ml-2.5 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-4" />
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
