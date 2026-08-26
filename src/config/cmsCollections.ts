import type { Category } from "./categories";

export interface CmsCollectionConfig {
  collectionId: string;
  /**
   * fieldData key to use as the search summary (e.g. "post-summary") — CMS
   * items have no standardized SEO/description field like static pages do
   * (that binding lives in the collection page template, not the API), so
   * there is no universal default. Omit if this collection has nothing
   * summary-shaped; the entry's summary just stays empty until an editor
   * fills it in manually.
   */
  summaryField?: string;
  /**
   * Category assigned when an item from this collection is first seen —
   * always overridable afterward in the admin, same rule as
   * DEFAULT_CATEGORY_RULES for pages. Collection identity already tells you
   * the content type, so there's no need for URL-prefix matching here.
   */
  defaultCategory?: Category;
}

/**
 * Which CMS collections feed the search index, and how. Only collections
 * listed here are synced — same philosophy as CATEGORIES: explicit
 * per-site config, not auto-discovery (a site can have collections, like
 * testimonials or team members, that were never meant to be searchable).
 * Empty by default; add an entry per collection when cloning for a new site.
 */
export const CMS_COLLECTIONS: CmsCollectionConfig[] = [];

export function getCmsCollectionConfig(collectionId: string): CmsCollectionConfig | undefined {
  return CMS_COLLECTIONS.find((c) => c.collectionId === collectionId);
}
