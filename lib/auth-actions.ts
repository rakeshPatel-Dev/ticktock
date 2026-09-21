"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";

export type AuthActionState = { error?: string; success?: string } | undefined;

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(30, "Username must be 30 characters or fewer.")
  .regex(
    /^[a-zA-Z0-9_.-]+$/,
    "Usernames can only contain letters, numbers, dots, dashes and underscores."
  );

export async function loginAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }
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
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }
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
  const username = String(formData.get("username") || "").trim();

  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

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