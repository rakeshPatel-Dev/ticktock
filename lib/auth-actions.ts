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
 * `user_username_idx` is a plain binary index and therefore case-SENSITIVE, so the
 * stored spelling is what makes the index mean what a user expects it to mean.
 *
 * Correcting an earlier claim in this file: the username plugin DOES normalise.
 * `node_modules/better-auth/dist/plugins/username/index.mjs` lowercases in a
 * `user.create.before` / `user.update.before` database hook, and `signInUsername`
 * looks the user up by `normalizer(username)`. So the normalisation below is
 * deliberate belt-and-braces, not the only line of defence, and it is kept for
 * three reasons:
 *
 *  - It does not depend on a plugin option that can be switched off.
 *    `usernameNormalization: false` in lib/auth.ts would silently reintroduce
 *    `Rakesh` and `rakesh` as two accounts, and this file would not notice.
 *  - The value the zod schema validates is then the value the index compares, so
 *    the character class below can be lowercase-only and still be honest about
 *    what is stored.
 *  - It keeps login, signup and updateUsername reading the same way. A mixed-case
 *    login attempt is normalised here before it ever reaches the plugin.
 *
 * Rows written by a raw adapter call or a script bypass the hook, so a
 * mixed-case username can still exist in the database - and then no login spelling
 * can match it, because both this file and the plugin lowercase what they compare.
 * That is a reason to keep the script paths canonical, not a reason to drop the
 * normalisation.
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
        // The account has no email address, but signUpEmail requires one: the
        // core endpoint validates it with z.email() and the user model declares
        // it required. The username plugin does NOT offer a username-only
        // sign-up - its only endpoints are signInUsername and
        // isUsernameAvailable - so a synthetic address is structural, not a
        // workaround, and cannot be removed without forking the auth flow.
        //
        // `.invalid` is reserved by RFC 2606 as guaranteed never to resolve, so
        // unlike the `.local` this replaces (mDNS, RFC 6762) nothing can deliver
        // to it or accept mail from it. It also cannot collide with a real
        // address if email is added later: no real domain exists in that TLD, and
        // the address is unique per user because the username is.
        email: `${username}@ticktock.invalid`,
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