import { requireUser } from "@/lib/session";
import { SettingsView } from "@/components/settings-view";
import type { auth } from "@/lib/auth";

export const metadata = {
  title: "Settings - TickTock",
  description: "TickTock preferences and data management.",
};

export default async function SettingsPage() {
  const user = await requireUser();
  const username = (user as typeof auth.$Infer.Session.user & { username?: string }).username ?? user.name;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 w-full">
      <div className="space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your account, focus goals, theme, and data export.
        </p>
      </div>

      <SettingsView username={username} />
    </div>
  );
}
