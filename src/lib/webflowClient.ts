import type { LocaleInfo } from "./localesStore";

export interface WebflowPageSeo {
  id: string;
  slug: string;
  publishedPath: string;
  webflowTitle: string;
  webflowMetaDescription: string;
}

interface WebflowPagesResponse {
  pages: Array<{
    id: string;
    // Webflow returns `null` (not "") for the site's home/root page —
    // confirmed empirically. Normalized to "" below at the API boundary so
    // nothing downstream (slug-prefix matching, category rules) has to
    // handle null.
    slug: string | null;
    publishedPath?: string;
    title?: string;
    draft?: boolean;
    archived?: boolean;
    // Set on a collection page TEMPLATE (e.g. "Blog Posts Template"), not on
    // real content — confirmed empirically against a real site. It has its
    // own publishedPath (e.g. "/post"), but that's just the template's
    // mount point, not a real page — skip it here.
    collectionId?: string | null;
    seo?: { title?: string; description?: string };
  }>;
  pagination: { total: number; limit: number; offset: number };
}

/**
 * Lists every published (non-draft, non-archived) static page of a Webflow
 * site via the Data API v2, following pagination. Pass `localeId` to get
 * that locale's slug/SEO fields — omit for the primary locale.
 */
export async function listStaticPages(
  siteId: string,
  token: string,
  localeId?: string
): Promise<WebflowPageSeo[]> {
  const results: WebflowPageSeo[] = [];
  const limit = 100;
  let offset = 0;
  const localeParam = localeId ? `&localeId=${encodeURIComponent(localeId)}` : "";

  while (true) {
    const res = await fetch(
      `https://api.webflow.com/v2/sites/${siteId}/pages?limit=${limit}&offset=${offset}${localeParam}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "accept-version": "2.0.0",
        },
      }
    );
    if (!res.ok) {
      throw new Error(`Webflow pages list failed: ${res.status} ${await res.text()}`);
    }
    const json = await res.json<WebflowPagesResponse>();
    for (const page of json.pages) {
      if (page.draft || page.archived || page.collectionId) continue;
      const slug = page.slug ?? "";
      results.push({
        id: page.id,
        slug,
        publishedPath: page.publishedPath ?? `/${slug}`,
        webflowTitle: page.seo?.title ?? page.title ?? "",
        webflowMetaDescription: page.seo?.description ?? "",
      });
    }
    offset += limit;
    if (offset >= json.pagination.total) break;
  }

  return results;
}

interface WebflowSiteResponse {
  locales?: {
    primary: WebflowLocale;
    secondary?: WebflowLocale[];
  };
}

interface WebflowLocale {
  id: string;
  displayName: string;
  subdirectory: string;
  tag?: string;
  cmsLocaleId?: string;
}

// Sentinel id for a site with no Webflow Localization configured at all —
// `GET /v2/sites/{id}` returns `locales: null` in that case (confirmed
// empirically; NOT `{ primary: {...} }` as previously assumed), so there is
// no real localeId to key page content by. Synthesizing one default locale
// keeps the rest of the pipeline (webhook loop, PageEntry.locales map, admin
// locale switcher) uniform whether or not Localization is enabled.
const DEFAULT_LOCALE: LocaleInfo = {
  id: "default",
  tag: "default",
  displayName: "Default",
  subdirectory: "",
  isPrimary: true,
};

/**
 * Reads the site's configured locales (primary + secondary) via the Data
 * API v2. A site with no Webflow Localization configured returns a single
 * synthetic default locale (see DEFAULT_LOCALE) — `listStaticPages` is
 * called without a `localeId` for it, which returns the site's normal,
 * unlocalized page content.
 */
export async function getSiteLocales(siteId: string, token: string): Promise<LocaleInfo[]> {
  const res = await fetch(`https://api.webflow.com/v2/sites/${siteId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "accept-version": "2.0.0",
    },
  });
  if (!res.ok) {
    throw new Error(`Webflow get site failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json<WebflowSiteResponse>();
  const locales = json.locales;
  if (!locales) return [DEFAULT_LOCALE];

  const toLocaleInfo = (locale: WebflowLocale, isPrimary: boolean): LocaleInfo => ({
    id: locale.id,
    tag: locale.tag ?? locale.subdirectory,
    displayName: locale.displayName,
    subdirectory: locale.subdirectory,
    isPrimary,
  });

  return [
    toLocaleInfo(locales.primary, true),
    ...(locales.secondary ?? []).map((l) => toLocaleInfo(l, false)),
  ];
}

/**
 * Finds the URL prefix live collection items are served under, by locating
 * the collection's page TEMPLATE among the site's pages and reading its own
 * `publishedPath` (e.g. "/post") — Webflow's own computed value, confirmed
 * against a real site to be the right prefix, unlike reconstructing one
 * from the collection's own `slug` field (which happened to match in that
 * one test but isn't a documented guarantee). Pass `localeId` the same way
 * as `listStaticPages` — the template's own publishedPath is itself
 * locale-prefixed for secondary locales, mirroring regular pages. Returns
 * null if the collection has no page template synced yet (e.g. draft, or
 * never actually built out in the Designer).
 */
export async function getCollectionPagePath(
  siteId: string,
  collectionId: string,
  token: string,
  localeId?: string
): Promise<string | null> {
  const limit = 100;
  let offset = 0;
  const localeParam = localeId ? `&localeId=${encodeURIComponent(localeId)}` : "";

  while (true) {
    const res = await fetch(
      `https://api.webflow.com/v2/sites/${siteId}/pages?limit=${limit}&offset=${offset}${localeParam}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "accept-version": "2.0.0",
        },
      }
    );
    if (!res.ok) {
      throw new Error(`Webflow pages list failed: ${res.status} ${await res.text()}`);
    }
    const json = await res.json<WebflowPagesResponse>();
    const match = json.pages.find((p) => p.collectionId === collectionId);
    if (match) return match.publishedPath ?? null;
    offset += limit;
    if (offset >= json.pagination.total) break;
  }
  return null;
}

export interface WebflowCollectionItem {
  id: string;
  slug: string;
  name: string;
  isDraft: boolean;
  isArchived: boolean;
  fieldData: Record<string, unknown>;
}

/**
 * Fetches a single CMS collection item, optionally for a specific locale
 * (mirrors listStaticPages's `localeId` — omit for the primary/default
 * locale). Unlike the collection_item_published webhook payload (which only
 * guarantees fieldData.name/slug), this returns the item's full fieldData,
 * needed to read a site-specific summary field (see CmsCollectionConfig).
 */
export async function getCollectionItem(
  collectionId: string,
  itemId: string,
  token: string,
  cmsLocaleId?: string
): Promise<WebflowCollectionItem | null> {
  const localeParam = cmsLocaleId ? `?cmsLocaleId=${encodeURIComponent(cmsLocaleId)}` : "";
  const res = await fetch(
    `https://api.webflow.com/v2/collections/${collectionId}/items/${itemId}${localeParam}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "accept-version": "2.0.0",
      },
    }
  );
  if (res.status === 404) return null; // item doesn't exist in this locale
  if (!res.ok) {
    throw new Error(`Webflow get collection item failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json<{
    id: string;
    isDraft?: boolean;
    isArchived?: boolean;
    fieldData: { name: string; slug: string | null; [key: string]: unknown };
  }>();
  return {
    id: json.id,
    slug: json.fieldData.slug ?? "",
    name: json.fieldData.name,
    isDraft: json.isDraft ?? false,
    isArchived: json.isArchived ?? false,
    fieldData: json.fieldData,
  };
}
