import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const getCurrentUser = cache(async () => {
  const requestHeaders = (await headers()) as unknown as Headers;
  const session = await auth.api.getSession({ headers: requestHeaders });
  return session?.user ?? null;
});

export const getUserId = cache(async () => {
  const user = await getCurrentUser();
  return user?.id ?? null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}