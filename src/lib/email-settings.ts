const STORAGE_KEY = "casemate.email-settings.v1";

export interface EmailSettings {
  /** Template for the email subject. Use {{FILE_NAME}} as placeholder. */
  subjectTemplate: string;
  /** Template for the email body. Use {{FILE_NAME}} as placeholder. */
  bodyTemplate: string;
}

export function getDefaultEmailSettings(): EmailSettings {
  return {
    subjectTemplate: "{{FILE_NAME}}",
    bodyTemplate:
      "Please find the attached file: {{FILE_NAME}}\n\n(The file has been downloaded to your device — please attach it to this email.)",
  };
}

export function renderEmailTemplate(template: string, fileName: string): string {
  return template.replace(/\{\{FILE_NAME\}\}/g, fileName);
}

function normalize(value: unknown): EmailSettings {
  const defaults = getDefaultEmailSettings();
  if (!value || typeof value !== "object") return defaults;
  const row = value as Partial<EmailSettings>;
  return {
    subjectTemplate:
      typeof row.subjectTemplate === "string" && row.subjectTemplate.trim()
        ? row.subjectTemplate
        : defaults.subjectTemplate,
    bodyTemplate:
      typeof row.bodyTemplate === "string" && row.bodyTemplate.trim()
        ? row.bodyTemplate
        : defaults.bodyTemplate,
  };
}

export function loadEmailSettings(): EmailSettings {
  if (typeof window === "undefined") return getDefaultEmailSettings();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultEmailSettings();
    return normalize(JSON.parse(raw));
  } catch {
    return getDefaultEmailSettings();
  }
}

export function saveEmailSettings(settings: EmailSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
