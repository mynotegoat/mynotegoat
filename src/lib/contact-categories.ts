const STORAGE_KEY = "casemate.contact-categories.v1";

const DEFAULT_CONTACT_CATEGORIES = [
  "Attorney",
  "Pain Management",
  "Orthopedic",
  "Neurologist",
  "Hospital/ER",
  "Imaging",
];

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ");
}

function isSpecialistCategory(value: string) {
  return value.toLowerCase() === "specialist";
}

function normalizeCategoryList(value: unknown) {
  if (!Array.isArray(value)) {
    return getDefaultContactCategories();
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  value.forEach((entry) => {
    const next = normalizeText(entry);
    if (!next || isSpecialistCategory(next)) {
      return;
    }
    const dedupeKey = next.toLowerCase();
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    normalized.push(next);
  });

  return normalized.length ? normalized : getDefaultContactCategories();
}

export function getDefaultContactCategories() {
  return [...DEFAULT_CONTACT_CATEGORIES];
}

export function loadContactCategories() {
  if (typeof window === "undefined") {
    return getDefaultContactCategories();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultContactCategories();
    }
    return normalizeCategoryList(JSON.parse(raw));
  } catch {
    return getDefaultContactCategories();
  }
}

export function saveContactCategories(categories: string[]) {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = normalizeCategoryList(categories);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

export function sanitizeContactCategory(category: string) {
  const next = normalizeText(category);
  if (!next) {
    return "Attorney";
  }
  if (isSpecialistCategory(next)) {
    return "Orthopedic";
  }
  return next;
}
