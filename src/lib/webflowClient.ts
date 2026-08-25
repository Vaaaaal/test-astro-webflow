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
    slug: string;
    publishedPath?: string;
    title?: string;
    draft?: boolean;
    archived?: boolean;
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
      if (page.draft || page.archived) continue;
      results.push({
        id: page.id,
        slug: page.slug,
        publishedPath: page.publishedPath ?? `/${page.slug}`,
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

/**
 * Reads the site's configured locales (primary + secondary) via the Data
 * API v2. A site with no localization configured returns just the primary.
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
  if (!locales) return [];

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
