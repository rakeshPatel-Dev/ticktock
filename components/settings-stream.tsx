import { requireUser } from "@/lib/session";
import { SettingsView } from "@/components/settings-view";
import type { auth } from "@/lib/auth";

/**
 * The settings panels behind one boundary.
 *
 * Only the username is server-supplied — the daily goal lives in
 * `localStorage` and the theme in `next-themes`, both client-only. That read is
 * still a real `requireUser()` round trip, so it belongs inside the boundary
 * where it can paint a skeleton, not in the page where it would hold back the
 * heading.
 */
export async function SettingsStream() {
  const user = await requireUser();
  const username =
    (user as typeof auth.$Infer.Session.user & { username?: string }).username ??
    user.name;

  return <SettingsView username={username} />;
}
