"use client";

import { useCallback, useState } from "react";
import {
  createContactId,
  getDefaultContactDirectory,
  loadContactDirectory,
  saveContactDirectory,
} from "@/lib/contact-directory";
import { sanitizeContactCategory } from "@/lib/contact-categories";
import type { ContactRecord } from "@/lib/mock-data";
import { formatUsPhoneInput } from "@/lib/phone-format";

type ContactDraft = {
  name: string;
  category: ContactRecord["category"];
  phone: string;
  fax?: string;
  email?: string;
  address?: string;
};

type AddContactResult =
  | { added: true; contact: ContactRecord }
  | { added: false; reason: string; contact?: ContactRecord };

type UpdateContactResult =
  | { updated: true; contact: ContactRecord }
  | { updated: false; reason: string; contact?: ContactRecord };

function normalizeCategory(category: string) {
  return sanitizeContactCategory(category);
}

export function useContactDirectory() {
  const [contacts, setContacts] = useState<ContactRecord[]>(() => loadContactDirectory());

  const updateContacts = useCallback((updater: (current: ContactRecord[]) => ContactRecord[]) => {
    setContacts((current) => {
      const next = updater(current);
      saveContactDirectory(next);
      return next;
    });
  }, []);

  const addContact = useCallback(
    (draft: ContactDraft): AddContactResult => {
      const name = draft.name.trim();
      const category = normalizeCategory(draft.category);
      const phone = formatUsPhoneInput(draft.phone);
      const fax = formatUsPhoneInput(draft.fax ?? "");
      const email = (draft.email ?? "").trim();
      const address = (draft.address ?? "").trim();

      if (!name || !phone) {
        return {
          added: false,
          reason: "Name and phone are required.",
        };
      }

      let addedContact: ContactRecord | null = null;
      let existingContact: ContactRecord | null = null;

      updateContacts((current) => {
        existingContact =
          current.find(
            (entry) =>
              entry.category.toLowerCase() === category.toLowerCase() &&
              entry.name.toLowerCase() === name.toLowerCase(),
          ) ?? null;

        if (existingContact) {
          return current;
        }

        const next: ContactRecord = {
          id: createContactId(),
          name,
          category,
          phone,
          fax,
          email,
          address,
        };
        addedContact = next;
        return [...current, next];
      });

      if (existingContact) {
        return {
          added: false,
          reason: "Contact already exists.",
          contact: existingContact,
        };
      }

      if (!addedContact) {
        return {
          added: false,
          reason: "Could not add contact.",
        };
      }

      return {
        added: true,
        contact: addedContact,
      };
    },
    [updateContacts],
  );

  const updateContact = useCallback(
    (id: string, draft: ContactDraft): UpdateContactResult => {
      const name = draft.name.trim();
      const category = normalizeCategory(draft.category);
      const phone = formatUsPhoneInput(draft.phone);
      const fax = formatUsPhoneInput(draft.fax ?? "");
      const email = (draft.email ?? "").trim();
      const address = (draft.address ?? "").trim();

      if (!name || !phone) {
        return {
          updated: false,
          reason: "Name and phone are required.",
        };
      }

      let updatedContact: ContactRecord | null = null;
      let duplicateContact: ContactRecord | null = null;

      updateContacts((current) => {
        const target = current.find((entry) => entry.id === id);
        if (!target) {
          return current;
        }

        duplicateContact =
          current.find(
            (entry) =>
              entry.id !== id &&
              entry.category.toLowerCase() === category.toLowerCase() &&
              entry.name.toLowerCase() === name.toLowerCase(),
          ) ?? null;

        if (duplicateContact) {
          return current;
        }

        const next = current.map((entry) => {
          if (entry.id !== id) {
            return entry;
          }
          const updated: ContactRecord = {
            ...entry,
            name,
            category,
            phone,
            fax,
            email,
            address,
          };
          updatedContact = updated;
          return updated;
        });

        return next;
      });

      if (duplicateContact) {
        return {
          updated: false,
          reason: "Contact already exists.",
          contact: duplicateContact,
        };
      }

      if (!updatedContact) {
        return {
          updated: false,
          reason: "Could not update contact.",
        };
      }

      return {
        updated: true,
        contact: updatedContact,
      };
    },
    [updateContacts],
  );

  const resetToDefaults = useCallback(() => {
    const defaults = getDefaultContactDirectory();
    setContacts(defaults);
    saveContactDirectory(defaults);
  }, []);

  return {
    contacts,
    addContact,
    updateContact,
    resetToDefaults,
  };
}
