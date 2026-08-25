import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { writePagesDoc } from "../../../lib/pagesStore";
import { writeLocalesDoc } from "../../../lib/localesStore";
import { getSiteLocales, listStaticPages, type WebflowPageSeo } from "../../../lib/webflowClient";
import { resolveDefaultCategory } from "../../../config/categories";
import { verifyWebflowSignature } from "../../../lib/webhookSignature";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request }) => {
  // Must read the raw body text (not request.json()) — the signature is an
  // HMAC over these exact bytes, and re-serializing a parsed object could
  // produce a different string (key order, whitespace) that fails to match.
  const rawBody = await request.text();
  const validSignature = await verifyWebflowSignature(
    rawBody,
    request.headers.get("x-webflow-timestamp"),
    request.headers.get("x-webflow-signature"),
    env.WEBFLOW_WEBHOOK_SECRET
  );
  if (!validSignature) {
    return json(401, { error: "unauthorized" });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "invalid_json" });
  }
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
      // Per Webflow's docs, omitting localeId returns the primary locale's
      // content — passing the primary's own id explicitly is not documented
      // as equivalent, and empirically returned zero pages. Only pass
      // localeId for actual secondary locales.
      pagesByLocale.set(
        locale.id,
        await listStaticPages(
          env.WEBFLOW_SITE_ID,
          env.WEBFLOW_API_TOKEN,
          locale.isPrimary ? undefined : locale.id
        )
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

  let doc;
  try {
    doc = await writePagesDoc(env.PAGES_BUCKET, (doc) => {
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
  } catch (err) {
    return json(500, {
      error: "pages_write_failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  return json(200, {
    ok: true,
    locales: locales.length,
    upserted: pageIds.size,
    total: doc.pages.length,
  });
};

