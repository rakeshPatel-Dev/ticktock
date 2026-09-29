import { Suspense } from "react";
import { SettingsStream } from "@/components/settings-stream";
import { SettingsSkeleton } from "@/components/skeletons";
import { PageHeader } from "@/components/page-header";

export const metadata = {
  title: "Settings - TickTock",
  description: "TickTock preferences and data management.",
};

export default function SettingsPage() {
  return (
    <div className="space-y-5 w-full">
      <PageHeader
        title="Settings"
        description="Your account, goals, appearance, and data."
      />

      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsStream />
      </Suspense>
    </div>
  );
}
