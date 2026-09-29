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
      {pending ? "Creating account…" : "Create account"}
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
        <p
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2 text-[13px] font-medium text-destructive"
        >
          {state.error}
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor={usernameId} className="block text-[13px] font-medium text-foreground">
          Username
        </label>
        <Input
          id={usernameId}
          name="username"
          autoComplete="username"
          placeholder="your_username"
          required
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={passwordId} className="block text-[13px] font-medium text-foreground">
          Password
        </label>
        <PasswordInput
          id={passwordId}
          name="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={confirmId} className="block text-[13px] font-medium text-foreground">
          Confirm password
        </label>
        <Input
          id={confirmId}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          required
        />
      </div>

      <div className="pt-1">
        <SubmitButton />
      </div>
    </form>
  );
}
