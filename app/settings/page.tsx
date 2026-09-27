import { Suspense } from "react";
import { SettingsStream } from "@/components/settings-stream";
import { SettingsSkeleton } from "@/components/skeletons";

export const metadata = {
  title: "Settings - TickTock",
  description: "TickTock preferences and data management.",
};

export default function SettingsPage() {
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

      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsStream />
      </Suspense>
    </div>
  );
}
