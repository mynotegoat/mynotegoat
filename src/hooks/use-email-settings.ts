"use client";

import { useCallback, useState } from "react";
import {
  loadEmailSettings,
  saveEmailSettings,
  type EmailSettings,
} from "@/lib/email-settings";

export function useEmailSettings() {
  const [emailSettings, setEmailSettings] = useState<EmailSettings>(() => loadEmailSettings());

  const updateEmailSettings = useCallback((patch: Partial<EmailSettings>) => {
    setEmailSettings((current) => {
      const next = { ...current, ...patch };
      saveEmailSettings(next);
      return next;
    });
  }, []);

  const resetEmailSettings = useCallback(() => {
    const defaults = loadEmailSettings();
    // Clear storage so defaults reload
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("casemate.email-settings.v1");
    }
    const fresh = loadEmailSettings();
    setEmailSettings(fresh);
  }, []);

  return { emailSettings, updateEmailSettings, resetEmailSettings };
}
