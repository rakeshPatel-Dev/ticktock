import { SettingsView } from "@/components/settings-view";

export const metadata = {
  title: "Settings - TickTock",
  description: "TickTock preferences and data management.",
};

export default function SettingsPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="text-xs text-muted-foreground">
          Manage your focus goals, theme, and data export.
        </p>
      </div>

      <SettingsView />
    </div>
  );
}
