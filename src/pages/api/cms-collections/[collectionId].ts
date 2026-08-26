import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  readCmsCollectionsDoc,
  writeCmsCollectionsDoc,
  type CmsCollectionEntry,
} from "../../../lib/cmsCollectionsStore";
import { readCategoriesDoc } from "../../../lib/categoriesStore";
import { recordActivity } from "../../../lib/activityLogStore";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const collectionId = params.collectionId;
  if (!collectionId) return json(400, { error: "missing_collection_id" });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json(400, { error: "invalid_json" });
  }
  const { summaryField, defaultCategory } = body as {
    summaryField?: unknown;
    defaultCategory?: unknown;
  };

  if (summaryField !== undefined && summaryField !== null && typeof summaryField !== "string") {
    return json(422, { error: "invalid_summary_field" });
  }
  if (
    defaultCategory !== undefined &&
    defaultCategory !== null &&
    typeof defaultCategory !== "string"
  ) {
    return json(422, { error: "invalid_default_category" });
  }
  if (typeof defaultCategory === "string") {
    const { doc: categoriesDoc } = await readCategoriesDoc(env.PAGES_BUCKET);
    if (!categoriesDoc.categories.some((c) => c.key === defaultCategory)) {
      return json(422, { error: "unknown_category" });
    }
  }

  const { doc: existingDoc } = await readCmsCollectionsDoc(env.PAGES_BUCKET);
  if (!existingDoc.collections.some((c) => c.collectionId === collectionId)) {
    return json(404, { error: "not_found" });
  }

  let updated: CmsCollectionEntry | null = null;
  await writeCmsCollectionsDoc(env.PAGES_BUCKET, (doc) => {
    const idx = doc.collections.findIndex((c) => c.collectionId === collectionId);
    if (idx === -1) return doc;
    const collection = doc.collections[idx];
    if (summaryField !== undefined) collection.summaryField = summaryField as string | null;
    if (defaultCategory !== undefined) collection.defaultCategory = defaultCategory as string | null;
    updated = collection;
    return doc;
  });

  if (!updated) return json(404, { error: "not_found" });

  await recordActivity(env.PAGES_BUCKET, {
    actorEmail: locals.user!.email,
    action: "cms_collection.updated",
    targetId: collectionId,
    targetLabel: collectionId,
  });

  return json(200, { ok: true, entry: updated });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const collectionId = params.collectionId;
  if (!collectionId) return json(400, { error: "missing_collection_id" });

  const { doc: existingDoc } = await readCmsCollectionsDoc(env.PAGES_BUCKET);
  if (!existingDoc.collections.some((c) => c.collectionId === collectionId)) {
    return json(404, { error: "not_found" });
  }

  await writeCmsCollectionsDoc(env.PAGES_BUCKET, (doc) => {
    doc.collections = doc.collections.filter((c) => c.collectionId !== collectionId);
    return doc;
  });

  // Unlike deleting a category, this only stops future syncing of new items
  // from this collection — existing pages.json entries for items already
  // synced are left untouched (removing them here would just have the
  // webhook recreate them on the item's next publish anyway; explicit
  // unpublish/delete in Webflow is the real removal path).
  await recordActivity(env.PAGES_BUCKET, {
    actorEmail: locals.user!.email,
    action: "cms_collection.removed",
    targetId: collectionId,
    targetLabel: collectionId,
  });

  return json(200, { ok: true });
};
