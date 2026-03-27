"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { CloudStateSync } from "@/components/cloud-state-sync";
import { prepareCloudStateBeforeMount } from "@/lib/cloud-state";

export default function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      await prepareCloudStateBeforeMount();
      if (active) {
        setMounted(true);
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen px-4 py-6 text-sm text-[var(--text-muted)] lg:px-8">
        Loading workspace...
      </div>
    );
  }

  return (
    <AppShell>
      <CloudStateSync />
      {children}
    </AppShell>
  );
}
