"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import {
  buildWorkspaceIdForUser,
  prepareCloudStateBeforeMount,
  setActiveWorkspaceId,
} from "@/lib/cloud-state";
import { installStorageSyncInterceptor, onSyncStatusChange, pauseSync, resumeSync } from "@/lib/storage-sync-interceptor";
import { resolveAuthAccessState } from "@/lib/auth-access";
import type { PlanTier } from "@/lib/plan-access";
import { PlanTierProvider } from "@/lib/plan-context";

export default function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [planTier, setPlanTier] = useState<PlanTier>("complete");
  const [syncStatus, setSyncStatus] = useState<"synced" | "syncing" | "error">("synced");

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const access = await resolveAuthAccessState();
      if (!active) {
        return;
      }

      if (access.state === "signed-out") {
        router.replace("/auth/login");
        return;
      }

      if (access.state === "email-unverified") {
        router.replace("/auth/login?verify=1");
        return;
      }

      if (access.state === "pending-approval") {
        router.replace("/auth/pending");
        return;
      }

      if (access.state !== "access-granted" || !access.userId) {
        router.replace("/auth/login");
        return;
      }

      if (access.isAdmin) {
        router.replace("/admin");
        return;
      }

      if (access.planTier) {
        setPlanTier(access.planTier);
      }

      const workspaceId = buildWorkspaceIdForUser(access.userId);
      setActiveWorkspaceId(workspaceId);

      // Install interceptor paused so bootstrap writes don't trigger syncs
      pauseSync();
      installStorageSyncInterceptor();
      onSyncStatusChange((status) => {
        if (active) {
          setSyncStatus(status);
        }
      });

      // MOUNT IMMEDIATELY — localStorage already has the data from last session.
      // Don't block the page on a cloud fetch.
      if (active) {
        setMounted(true);
      }

      // Pull cloud data in the BACKGROUND after the page is already visible.
      // If cloud has newer data, it overwrites localStorage and hooks re-read on next render.
      try {
        await prepareCloudStateBeforeMount();
      } catch (error) {
        console.warn("[Portal] Cloud sync skipped:", error);
      }

      resumeSync();
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [router]);

  if (!mounted) {
    return (
      <div className="min-h-screen px-4 py-6 text-sm text-[var(--text-muted)] lg:px-8">
        Checking account access...
      </div>
    );
  }

  return (
    <PlanTierProvider planTier={planTier}>
      <AppShell planTier={planTier}>
        {/* Sync status indicator */}
        <div className="pointer-events-none fixed bottom-3 right-3 z-50">
          {syncStatus === "syncing" && (
            <div className="pointer-events-auto rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
              Saving to cloud...
            </div>
          )}
          {syncStatus === "error" && (
            <div className="pointer-events-auto rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
              Cloud sync failed — retrying
            </div>
          )}
        </div>
        {children}
      </AppShell>
    </PlanTierProvider>
  );
}
