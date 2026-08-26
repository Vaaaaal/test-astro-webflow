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

export const GET: APIRoute = async () => {
  const { doc } = await readCmsCollectionsDoc(env.PAGES_BUCKET);
  return json(200, doc.collections);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json(400, { error: "invalid_json" });
  }
  const { collectionId, summaryField, defaultCategory } = body as {
    collectionId?: unknown;
    summaryField?: unknown;
    defaultCategory?: unknown;
  };

  if (typeof collectionId !== "string" || collectionId.trim().length === 0) {
    return json(422, { error: "invalid_collection_id" });
  }
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
  if (existingDoc.collections.some((c) => c.collectionId === collectionId)) {
    return json(409, { error: "already_exists" });
  }

  const entry: CmsCollectionEntry = {
    collectionId,
    summaryField: (summaryField as string | null | undefined) ?? null,
    defaultCategory: (defaultCategory as string | null | undefined) ?? null,
  };

  const doc = await writeCmsCollectionsDoc(env.PAGES_BUCKET, (doc) => {
    doc.collections.push(entry);
    return doc;
  });

  await recordActivity(env.PAGES_BUCKET, {
    actorEmail: locals.user!.email,
    action: "cms_collection.configured",
    targetId: collectionId,
    targetLabel: collectionId,
  });

  return json(201, {
    ok: true,
    entry: doc.collections.find((c) => c.collectionId === collectionId),
  });
};
