import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { writePagesDoc } from "../../../lib/pagesStore";
import { writeLocalesDoc, readLocalesDoc, type LocaleInfo } from "../../../lib/localesStore";
import {
  getSiteLocales,
  listStaticPages,
  getCollection,
  getCollectionItem,
  type WebflowPageSeo,
  type WebflowCollectionItem,
} from "../../../lib/webflowClient";
import { resolveDefaultCategory } from "../../../config/categories";
import { getCmsCollectionConfig } from "../../../config/cmsCollections";
import { verifyWebflowSignature } from "../../../lib/webhookSignature";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleSitePublish(siteId: string | undefined): Promise<Response> {
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
            kind: "page",
            collectionId: null,
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
}

async function handleCollectionItemRemoved(itemId: string | undefined): Promise<Response> {
  if (!itemId) return json(400, { error: "invalid_payload" });
  const doc = await writePagesDoc(env.PAGES_BUCKET, (doc) => {
    doc.pages = doc.pages.filter((p) => p.id !== itemId);
    return doc;
  });
  return json(200, { ok: true, removed: itemId, total: doc.pages.length });
}

async function handleCollectionItemPublished(
  itemId: string | undefined,
  collectionId: string | undefined
): Promise<Response> {
  if (!itemId || !collectionId) return json(400, { error: "invalid_payload" });

  const cmsConfig = getCmsCollectionConfig(collectionId);
  if (!cmsConfig) return json(200, { skipped: true, reason: "collection_not_configured" });

  const localesDoc = await readLocalesDoc(env.PAGES_BUCKET);
  const locales: LocaleInfo[] = localesDoc.locales;

  let collection;
  const itemsByLocale = new Map<string, WebflowCollectionItem | null>();
  try {
    collection = await getCollection(collectionId, env.WEBFLOW_API_TOKEN);
    for (const locale of locales) {
      itemsByLocale.set(
        locale.id,
        await getCollectionItem(
          collectionId,
          itemId,
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

  // The item may be live in some locales and not yet translated/published in
  // others. If it isn't live anywhere, treat this the same as an unpublish.
  const isLiveSomewhere = [...itemsByLocale.values()].some(
    (item) => item && !item.isDraft && !item.isArchived
  );
  if (!isLiveSomewhere) {
    return handleCollectionItemRemoved(itemId);
  }

  const now = new Date().toISOString();
  let doc;
  try {
    doc = await writePagesDoc(env.PAGES_BUCKET, (doc) => {
      let entry = doc.pages.find((p) => p.id === itemId);
      if (!entry) {
        entry = {
          id: itemId,
          kind: "cms",
          collectionId,
          lastPublishedAt: now,
          category: cmsConfig.defaultCategory ?? null,
          visibleInSearch: true,
          locales: {},
        };
        doc.pages.push(entry);
      } else {
        entry.lastPublishedAt = now;
      }

      for (const locale of locales) {
        const item = itemsByLocale.get(locale.id);
        if (!item || item.isDraft || item.isArchived) continue;
        const existing = entry.locales[locale.id];
        const summary = cmsConfig.summaryField
          ? String(item.fieldData[cmsConfig.summaryField] ?? "")
          : "";
        const subdirectoryPrefix = locale.subdirectory ? `/${locale.subdirectory}` : "";
        entry.locales[locale.id] = {
          slug: item.slug,
          publishedPath: `${subdirectoryPrefix}/${collection.slug}/${item.slug}`,
          webflowTitle: item.name,
          webflowMetaDescription: summary,
          title: existing?.title ?? null,
          summary: existing?.summary ?? null,
        };
      }
      return doc;
    });
  } catch (err) {
    return json(500, {
      error: "pages_write_failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  return json(200, { ok: true, kind: "cms", id: itemId, total: doc.pages.length });
}

export const POST: APIRoute = async ({ request }) => {
  // Must read the raw body text (not request.json()) — the signature is an
  // HMAC over these exact bytes, and re-serializing a parsed object could
  // produce a different string (key order, whitespace) that fails to match.
  const rawBody = await request.text();
  const secrets = (env.WEBFLOW_WEBHOOK_SECRETS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const validSignature = await verifyWebflowSignature(
    rawBody,
    request.headers.get("x-webflow-timestamp"),
    request.headers.get("x-webflow-signature"),
    secrets
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

  const { triggerType, payload } = body as {
    triggerType?: string;
    payload?: { siteId?: string; id?: string; collectionId?: string };
  };

  switch (triggerType) {
    case "site_publish":
      return handleSitePublish(payload?.siteId);
    case "collection_item_published":
      return handleCollectionItemPublished(payload?.id, payload?.collectionId);
    case "collection_item_unpublished":
    case "collection_item_deleted":
      return handleCollectionItemRemoved(payload?.id);
    default:
      return json(200, { skipped: true });
  }
};
