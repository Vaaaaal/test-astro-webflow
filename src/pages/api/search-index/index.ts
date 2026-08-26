import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { readPagesDoc } from "../../../lib/pagesStore";
import { readLocalesDoc } from "../../../lib/localesStore";
import { readCategoriesDoc, getCategoryLabel } from "../../../lib/categoriesStore";
import { getCustomFieldConfig, getCustomFieldOptionLabel } from "../../../config/customFields";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Public, read-only data meant to be fetched from the Webflow site
      // itself (a different origin) — no auth, no cookies involved.
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// Public search index for the front-end widget — deliberately NOT behind
// the /api auth middleware (see src/middleware.ts). Only ever exposes pages
// with visibleInSearch: true, and only the fields meant to be public.
export const GET: APIRoute = async ({ url }) => {
  const requestedTag = url.searchParams.get("locale");

  const localesDoc = await readLocalesDoc(env.PAGES_BUCKET);
  const locale = requestedTag
    ? localesDoc.locales.find((l) => l.tag === requestedTag)
    : localesDoc.locales.find((l) => l.isPrimary);

  if (!locale) {
    return json(404, { error: "locale_not_found" });
  }

  const [{ doc }, { doc: categoriesDoc }] = await Promise.all([
    readPagesDoc(env.PAGES_BUCKET),
    readCategoriesDoc(env.PAGES_BUCKET),
  ]);

  const results = doc.pages
    .filter((page) => page.visibleInSearch)
    .map((page) => {
      const content = page.locales[locale.id];
      if (!content) return null;

      const customFields: Record<string, string> = {};
      for (const [key, value] of [
        ...Object.entries(page.customFields),
        ...Object.entries(content.customFields),
      ]) {
        const fieldConfig = getCustomFieldConfig(key);
        if (!fieldConfig) continue;
        customFields[key] =
          fieldConfig.type === "select"
            ? getCustomFieldOptionLabel(fieldConfig, value, locale.tag)
            : value;
      }

      return {
        url: content.publishedPath,
        title: content.title ?? content.webflowTitle,
        summary: content.summary ?? content.webflowMetaDescription,
        category: page.category
          ? getCategoryLabel(categoriesDoc.categories, page.category, locale.tag)
          : null,
        ...customFields,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return json(200, results);
};
