"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CloudStateSync } from "@/components/cloud-state-sync";
import {
  buildWorkspaceIdForUser,
  prepareCloudStateBeforeMount,
  setActiveWorkspaceId,
} from "@/lib/cloud-state";
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

      try {
        await prepareCloudStateBeforeMount();
      } catch (error) {
        console.warn("[Portal] Cloud bootstrap skipped:", error);
      }

      if (active) {
        setMounted(true);
      }
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
        <CloudStateSync />
        {children}
      </AppShell>
    </PlanTierProvider>
  );
}
