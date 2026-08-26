export interface CategoryEntry {
  key: string; // stable, immutable after creation — renaming would orphan pages already tagged with it
  adminLabel: string; // shown in the Astro admin UI, one reference language only
  localeLabels: Partial<Record<string, string>>; // for the future public search widget, keyed by locale tag
  prefixes: Partial<Record<string, string>>; // default-category slug-prefix matching, "*" = fallback, else per locale tag
}

export interface CategoriesDocument {
  schemaVersion: 1;
  updatedAt: string;
  categories: CategoryEntry[];
}

export const CATEGORIES_OBJECT_KEY = "categories.json";

function emptyDocument(): CategoriesDocument {
  return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), categories: [] };
}

export async function readCategoriesDoc(
  bucket: R2Bucket
): Promise<{ doc: CategoriesDocument; etag: string | null }> {
  const obj = await bucket.get(CATEGORIES_OBJECT_KEY);
  if (!obj) {
    return { doc: emptyDocument(), etag: null };
  }
  const doc = await obj.json<CategoriesDocument>();
  return { doc, etag: obj.etag };
}

/**
 * Read-modify-write with optimistic concurrency, same pattern as
 * pagesStore.ts's writePagesDoc.
 */
export async function writeCategoriesDoc(
  bucket: R2Bucket,
  mutate: (doc: CategoriesDocument) => CategoriesDocument,
  maxAttempts = 3
): Promise<CategoriesDocument> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { doc, etag } = await readCategoriesDoc(bucket);
    const next = mutate(doc);
    next.updatedAt = new Date().toISOString();
    const putOptions = etag ? { onlyIf: { etagMatches: etag } } : undefined;
    try {
      const result = await bucket.put(CATEGORIES_OBJECT_KEY, JSON.stringify(next), putOptions);
      if (result) return next;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `Failed to write ${CATEGORIES_OBJECT_KEY} after ${maxAttempts} concurrent-write retries`,
    { cause: lastError }
  );
}

/** Admin-facing label for a category key — falls back to the raw key if unknown. */
export function getCategoryAdminLabel(categories: CategoryEntry[], key: string): string {
  return categories.find((c) => c.key === key)?.adminLabel ?? key;
}

/**
 * Resolves the display label for a category in a given locale, for the
 * future public search widget. Falls back to the admin label when the
 * locale tag has no translation set.
 */
export function getCategoryLabel(categories: CategoryEntry[], key: string, localeTag: string): string {
  const category = categories.find((c) => c.key === key);
  if (!category) return key;
  return category.localeLabels[localeTag] ?? category.adminLabel;
}

/**
 * Resolves the default category for a newly-seen page from its slug across
 * every locale it exists in (not just the primary locale) — a site can
 * localize slugs per language on some Webflow plans, but the folder-level
 * prefix usually survives translation even when the leaf segment doesn't,
 * so checking every locale catches that common case. When a category
 * specifies a prefix for a particular locale, that prefix is used for that
 * locale instead of "*" — for sites where folder segments genuinely do get
 * translated differently per language. Returns null when no category
 * matches any locale.
 */
export function resolveDefaultCategory(
  categories: CategoryEntry[],
  slugsByLocale: { localeTag: string; slug: string }[]
): string | null {
  for (const category of categories) {
    for (const { localeTag, slug } of slugsByLocale) {
      const prefix = category.prefixes[localeTag] ?? category.prefixes["*"];
      if (prefix !== undefined && slug.startsWith(prefix)) {
        return category.key;
      }
    }
  }
  return null;
}
