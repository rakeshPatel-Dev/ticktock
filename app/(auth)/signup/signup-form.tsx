"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { signupAction } from "@/lib/auth-actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="lg" className="w-full">
      {pending ? "Creating account..." : "Create account"}
    </Button>
  );
}

export function SignupForm() {
  const [state, formAction] = useActionState(signupAction, undefined);
  const usernameId = useId();
  const passwordId = useId();
  const confirmId = useId();

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <div
          role="alert"
          className="p-3 text-sm rounded-2xl bg-destructive/10 text-destructive font-medium border border-destructive/20"
        >
          {state.error}
        </div>
      )}

      <div className="space-y-1.5">
        <label
          htmlFor={usernameId}
          className="text-sm font-semibold text-foreground"
        >
          Username
        </label>
        <Input
          id={usernameId}
          name="username"
          autoComplete="username"
          placeholder="your_username"
          required
          className="h-11 rounded-full text-base"
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor={passwordId}
          className="text-sm font-semibold text-foreground"
        >
          Password
        </label>
        <PasswordInput
          id={passwordId}
          name="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
          className="h-11 rounded-full text-base"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor={confirmId}
          className="text-sm font-semibold text-foreground"
        >
          Confirm password
        </label>
        <Input
          id={confirmId}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          required
          className="h-11 rounded-full text-base"
        />
      </div>

      <SubmitButton />
    </form>
  );
}