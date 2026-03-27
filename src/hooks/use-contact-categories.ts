"use client";

import { useCallback, useState } from "react";
import {
  getDefaultContactCategories,
  loadContactCategories,
  saveContactCategories,
} from "@/lib/contact-categories";

type MutateCategoryResult =
  | { ok: true }
  | { ok: false; reason: string };

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function useContactCategories() {
  const [categories, setCategories] = useState<string[]>(() => loadContactCategories());

  const updateCategories = useCallback((updater: (current: string[]) => string[]) => {
    setCategories((current) => {
      const next = updater(current);
      saveContactCategories(next);
      return next;
    });
  }, []);

  const addCategory = useCallback(
    (label: string): MutateCategoryResult => {
      const next = normalizeText(label);
      if (!next) {
        return { ok: false, reason: "Category name is required." };
      }
      if (next.toLowerCase() === "specialist") {
        return { ok: false, reason: "Specialist is not a contact category." };
      }

      let wasAdded = false;
      updateCategories((current) => {
        if (current.some((entry) => entry.toLowerCase() === next.toLowerCase())) {
          return current;
        }
        wasAdded = true;
        return [...current, next];
      });

      return wasAdded ? { ok: true } : { ok: false, reason: "Category already exists." };
    },
    [updateCategories],
  );

  const removeCategory = useCallback(
    (label: string): MutateCategoryResult => {
      const target = normalizeText(label).toLowerCase();
      if (!target) {
        return { ok: false, reason: "Category is required." };
      }

      let removed = false;
      updateCategories((current) => {
        const filtered = current.filter((entry) => entry.toLowerCase() !== target);
        removed = filtered.length < current.length;
        if (!filtered.length) {
          return getDefaultContactCategories();
        }
        return filtered;
      });

      if (!removed) {
        return { ok: false, reason: "Category not found." };
      }
      return { ok: true };
    },
    [updateCategories],
  );

  const resetToDefaults = useCallback(() => {
    const defaults = getDefaultContactCategories();
    setCategories(defaults);
    saveContactCategories(defaults);
  }, []);

  return {
    categories,
    addCategory,
    removeCategory,
    resetToDefaults,
  };
}
