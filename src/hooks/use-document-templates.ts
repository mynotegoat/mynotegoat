"use client";

import { useCallback, useState } from "react";
import {
  documentFontOptions,
  getDefaultBodyForDocumentScope,
  getDefaultDocumentTemplateLibrary,
  loadDocumentTemplateLibrary,
  saveDocumentTemplateLibrary,
  type DocumentTemplateHeader,
  type DocumentTemplate,
  type DocumentTemplateLibrary,
  type DocumentTemplateScope,
} from "@/lib/document-templates";

function createTemplateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultDocumentFontFamily() {
  return documentFontOptions[0]?.value ?? "Georgia, 'Times New Roman', serif";
}

export function useDocumentTemplates() {
  const [documentTemplates, setDocumentTemplates] = useState<DocumentTemplateLibrary>(() =>
    loadDocumentTemplateLibrary(),
  );

  const updateLibrary = useCallback((updater: (current: DocumentTemplateLibrary) => DocumentTemplateLibrary) => {
    setDocumentTemplates((current) => {
      const next = updater(current);
      saveDocumentTemplateLibrary(next);
      return next;
    });
  }, []);

  const addTemplate = useCallback(
    (nameDraft: string, scope: DocumentTemplateScope, body: string) => {
      const name = nameDraft.trim();
      const templateBody = body.trim();
      if (!name || !templateBody) {
        return null;
      }

      let createdId: string | null = null;
      updateLibrary((current) => {
        if (
          (scope === "specialistReferral" || scope === "imagingRequest") &&
          current.templates.some((entry) => entry.scope === scope)
        ) {
          return current;
        }
        const exists = current.templates.some(
          (entry) =>
            entry.scope === scope && entry.name.toLowerCase() === name.toLowerCase(),
        );
        if (exists) {
          return current;
        }
        createdId = createTemplateId("doc");
        return {
          ...current,
          templates: [
            ...current.templates,
            {
              id: createdId,
              name,
              scope,
              body: templateBody,
              fontFamily: defaultDocumentFontFamily(),
              showOfficeLogo: true,
              active: true,
            },
          ],
        };
      });

      return createdId;
    },
    [updateLibrary],
  );

  const ensureScopeTemplate = useCallback(
    (scope: "specialistReferral" | "imagingRequest") => {
      let ensuredId: string | null = null;
      updateLibrary((current) => {
        const existing = current.templates.find((entry) => entry.scope === scope);
        if (existing) {
          ensuredId = existing.id;
          return current;
        }
        const createdTemplate: DocumentTemplate = {
          id: createTemplateId(scope === "specialistReferral" ? "doc-specialist" : "doc-imaging"),
          name: scope === "specialistReferral" ? "Specialist Referral" : "Imaging Request",
          scope,
          body: getDefaultBodyForDocumentScope(scope),
          fontFamily: defaultDocumentFontFamily(),
          showOfficeLogo: true,
          active: true,
        };
        ensuredId = createdTemplate.id;
        return {
          ...current,
          templates: [...current.templates, createdTemplate],
        };
      });
      return ensuredId;
    },
    [updateLibrary],
  );

  const addLetterTemplate = useCallback(
    (nameDraft: string) => {
      const name = nameDraft.trim();
      if (!name) {
        return null;
      }
      return addTemplate(name, "generalLetter", getDefaultBodyForDocumentScope("generalLetter"));
    },
    [addTemplate],
  );

  const updateTemplate = useCallback(
    (id: string, patch: Partial<Omit<DocumentTemplate, "id">>) => {
      updateLibrary((current) => ({
        ...current,
        templates: current.templates.map((entry) => {
          if (entry.id !== id) {
            return entry;
          }
          return {
            ...entry,
            ...patch,
            name: patch.name === undefined ? entry.name : patch.name.trim(),
            body: patch.body === undefined ? entry.body : patch.body,
          };
        }),
      }));
    },
    [updateLibrary],
  );

  const updateHeader = useCallback(
    (patch: Partial<DocumentTemplateHeader>) => {
      updateLibrary((current) => ({
        ...current,
        header: {
          ...current.header,
          ...patch,
          body: patch.body === undefined ? current.header.body : patch.body,
          fontFamily:
            patch.fontFamily === undefined ? current.header.fontFamily : patch.fontFamily,
        },
      }));
    },
    [updateLibrary],
  );

  const removeTemplate = useCallback(
    (id: string) => {
      updateLibrary((current) => {
        const nextTemplates = current.templates.filter((entry) => entry.id !== id);
        if (nextTemplates.length > 0) {
          return {
            ...current,
            templates: nextTemplates,
          };
        }
        return getDefaultDocumentTemplateLibrary();
      });
    },
    [updateLibrary],
  );

  const resetToDefaults = useCallback(() => {
    const defaults = getDefaultDocumentTemplateLibrary();
    setDocumentTemplates(defaults);
    saveDocumentTemplateLibrary(defaults);
  }, []);

  return {
    documentTemplates,
    addTemplate,
    addLetterTemplate,
    ensureScopeTemplate,
    updateTemplate,
    updateHeader,
    removeTemplate,
    resetToDefaults,
  };
}
