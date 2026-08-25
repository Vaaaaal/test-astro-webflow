import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { writePagesDoc } from "../../../lib/pagesStore";
import { writeLocalesDoc } from "../../../lib/localesStore";
import { getSiteLocales, listStaticPages, type WebflowPageSeo } from "../../../lib/webflowClient";
import { resolveDefaultCategory } from "../../../config/categories";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// TODO(security): Webflow's Data API v2 webhook delivery may support
// cryptographic signature verification (HMAC over the raw request body,
// keyed by a secret returned at webhook-registration time). Confirm the
// current mechanism at https://developer.webflow.com/data/reference/webhooks
// before relying solely on the shared-secret header check below.
export const POST: APIRoute = async ({ request }) => {
  const providedSecret = request.headers.get("X-Webhook-Secret");
  if (!env.WEBHOOK_SHARED_SECRET || providedSecret !== env.WEBHOOK_SHARED_SECRET) {
    return json(401, { error: "unauthorized" });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json(400, { error: "invalid_json" });
  }

  const { triggerType, payload } = body as { triggerType?: string; payload?: { siteId?: string } };
  if (triggerType !== "site_publish") {
    return json(200, { skipped: true });
  }

  const siteId = payload?.siteId ?? env.WEBFLOW_SITE_ID;
  if (!siteId || siteId !== env.WEBFLOW_SITE_ID) {
    return json(403, { error: "site_mismatch" });
  }

  let locales;
  const pagesByLocale = new Map<string, WebflowPageSeo[]>();
  try {
    locales = await getSiteLocales(env.WEBFLOW_SITE_ID, env.WEBFLOW_API_TOKEN);
    for (const locale of locales) {
      pagesByLocale.set(
        locale.id,
        await listStaticPages(env.WEBFLOW_SITE_ID, env.WEBFLOW_API_TOKEN, locale.id)
      );
    }
  } catch (err) {
    return json(502, {
      error: "webflow_api_error",
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  await writeLocalesDoc(env.PAGES_BUCKET, locales);

  const now = new Date().toISOString();
  const pageIds = new Set<string>();
  for (const pages of pagesByLocale.values()) {
    for (const p of pages) pageIds.add(p.id);
  }

  const doc = await writePagesDoc(env.PAGES_BUCKET, (doc) => {
    for (const pageId of pageIds) {
      let entry = doc.pages.find((p) => p.id === pageId);
      if (!entry) {
        const slugsByLocale = locales
          .map((locale) => {
            const slug = pagesByLocale.get(locale.id)?.find((p) => p.id === pageId)?.slug;
            return slug !== undefined ? { localeTag: locale.tag, slug } : null;
          })
          .filter((x): x is { localeTag: string; slug: string } => x !== null);
        entry = {
          id: pageId,
          lastPublishedAt: now,
          category: resolveDefaultCategory(slugsByLocale),
          visibleInSearch: true,
          locales: {},
        };
        doc.pages.push(entry);
      } else {
        entry.lastPublishedAt = now;
      }

      for (const locale of locales) {
        const wfPage = pagesByLocale.get(locale.id)?.find((p) => p.id === pageId);
        if (!wfPage) continue; // page not present in this locale's list
        const existing = entry.locales[locale.id];
        entry.locales[locale.id] = {
          slug: wfPage.slug,
          publishedPath: wfPage.publishedPath,
          webflowTitle: wfPage.webflowTitle,
          webflowMetaDescription: wfPage.webflowMetaDescription,
          title: existing?.title ?? null,
          summary: existing?.summary ?? null,
        };
      }
    }
    return doc;
  });

  return json(200, {
    ok: true,
    locales: locales.length,
    upserted: pageIds.size,
    total: doc.pages.length,
  });
};

