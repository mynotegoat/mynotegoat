"use client";

import { useEffect } from "react";
import { isCloudSyncEnabled, pushLocalStateToCloud } from "@/lib/cloud-state";

const AUTOSAVE_MS = 10_000;

export function CloudStateSync() {
  useEffect(() => {
    if (!isCloudSyncEnabled()) {
      return;
    }

    const syncNow = () => {
      void pushLocalStateToCloud();
    };

    const autosaveId = window.setInterval(syncNow, AUTOSAVE_MS);
    const handleBeforeUnload = () => {
      syncNow();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        syncNow();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(autosaveId);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
