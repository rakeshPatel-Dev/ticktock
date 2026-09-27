"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";

export type AuthActionState = { error?: string; success?: string } | undefined;

/**
 * Canonical username form. `.toLowerCase()` runs before the regex and before the
 * length checks, so `RaKeSh`, `  RaKeSh  ` and `rakesh` all resolve to the single
 * value `rakesh`.
 *
 * This is what makes the `user_username_idx` unique index mean what a user expects
 * it to mean. That index is a plain binary index and therefore case-SENSITIVE —
 * verified against a live cluster, `rakesh`, `Rakesh` and `RAKESH` were all accepted
 * side by side. Nothing in Better Auth lowercases a username (it lowercases email in
 * a few places, never username), so the normalisation has to happen here or not at
 * all. Storing one canonical form keeps signup, login and the database in agreement.
 *
 * Consequence: a username that is somehow stored mixed-case (e.g. written by the
 * auth HTTP API, which bypasses this schema) becomes unloginable, because login
 * normalises the input and will never match the stored value.
 */
const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters.")
  .max(30, "Username must be 30 characters or fewer.")
  .regex(
    /^[a-z0-9_.-]+$/,
    "Usernames can only contain letters, numbers, dots, dashes and underscores."
  );

export async function loginAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = usernameSchema.safeParse(String(formData.get("username") || ""));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }
  const username = parsed.data;
  const password = String(formData.get("password") || "");

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  try {
    const h = await headers();
    await auth.api.signInUsername({
      body: { username, password },
      headers: h as Headers,
    });
  } catch (err) {
    if (err instanceof APIError) {
      return { error: "Invalid username or password." };
    }
    throw err;
  }

  redirect("/");
}

export async function signupAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  const parsed = usernameSchema.safeParse(String(formData.get("username") || ""));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }
  const username = parsed.data;
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  try {
    const h = await headers();
    await auth.api.signUpEmail({
      body: {
        username,
        name: username,
        email: `${username}@ticktock.local`,
        password,
      },
      headers: h as Headers,
    });
  } catch (err) {
    if (err instanceof APIError) {
      const status = err.status;
      const body = err.body as { code?: string; message?: string } | undefined;
      const code = body?.code;
      if (status === 409 || code === "USER_ALREADY_EXISTS") {
        return { error: "That username is already taken." };
      }
      const message = body?.message;
      return { error: `Signup failed: ${message || err.message}` };
    }
    throw err;
  }

  redirect("/");
}

export async function logoutAction(): Promise<void> {
  try {
    const h = await headers();
    await auth.api.signOut({ headers: h as Headers });
  } catch {
    // Proceed with redirect even if signOut throws
  }

  redirect("/login");
}

export async function updateUsernameAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = usernameSchema.safeParse(String(formData.get("username") || ""));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }
  const username = parsed.data;

  try {
    const h = await headers();
    await auth.api.updateUser({
      body: { username },
      headers: h as Headers,
    });
  } catch (err) {
    if (err instanceof APIError) {
      const body = err.body as { code?: string; message?: string } | undefined;
      const code = body?.code ?? "";
      if (
        err.status === 422 ||
        code.includes("USERNAME_ALREADY_TAKEN") ||
        code.includes("USER_ALREADY_EXISTS")
      ) {
        return { error: "That username is already taken." };
      }
      const message = body?.message;
      return { error: message || "Failed to update username." };
    }
    throw err;
  }

  return { success: `Username updated to ${username}.` };
}

export async function changePasswordAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (currentPassword.length === 0) {
    return { error: "Enter your current password." };
  }
  if (newPassword.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }
  if (newPassword !== confirmPassword) {
    return { error: "New passwords do not match." };
  }

  try {
    const h = await headers();
    await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: false },
      headers: h as Headers,
    });
  } catch (err) {
    if (err instanceof APIError) {
      return { error: "Current password is incorrect." };
    }
    throw err;
  }

  return { success: "Password updated." };
}