import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { readPagesDoc, writePagesDoc, type PageEntry } from "../../../lib/pagesStore";
import { readCategoriesDoc } from "../../../lib/categoriesStore";
import { recordActivity } from "../../../lib/activityLogStore";

// Batch-editable subset of PATCH /api/pages/:id — only page-level fields
// that make sense to set identically across many pages at once. Title/
// summary/customFields are per-locale free text, not a good batch fit.
const EDITABLE_KEYS = ["category", "visibleInSearch"] as const;
type EditableKey = (typeof EDITABLE_KEYS)[number];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const PATCH: APIRoute = async ({ request, locals }) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json(400, { error: "invalid_json" });
  }

  const { ids, patch } = body as { ids?: unknown; patch?: unknown };
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string")) {
    return json(400, { error: "invalid_ids" });
  }
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return json(400, { error: "invalid_patch" });
  }

  const patchKeys = Object.keys(patch);
  if (patchKeys.length === 0) {
    return json(400, { error: "empty_patch" });
  }
  for (const key of patchKeys) {
    if (!EDITABLE_KEYS.includes(key as EditableKey)) {
      return json(400, { error: "read_only_field", field: key });
    }
  }

  const typedPatch = patch as Partial<Record<EditableKey, unknown>>;

  if ("category" in typedPatch && typedPatch.category !== null) {
    const { doc: categoriesDoc } = await readCategoriesDoc(env.PAGES_BUCKET);
    const allowedKeys = categoriesDoc.categories.map((c) => c.key);
    if (!allowedKeys.includes(typedPatch.category as string)) {
      return json(422, { error: "invalid_category", allowed: allowedKeys });
    }
  }
  if ("visibleInSearch" in typedPatch && typeof typedPatch.visibleInSearch !== "boolean") {
    return json(422, { error: "invalid_field", field: "visibleInSearch" });
  }

  const uniqueIds = [...new Set(ids)];
  const { doc: existingDoc } = await readPagesDoc(env.PAGES_BUCKET);
  const missingIds = uniqueIds.filter((id) => !existingDoc.pages.some((p) => p.id === id));
  if (missingIds.length > 0) {
    return json(404, { error: "not_found", ids: missingIds });
  }

  const updated: PageEntry[] = [];
  await writePagesDoc(env.PAGES_BUCKET, (doc) => {
    updated.length = 0;
    for (const entry of doc.pages) {
      if (!uniqueIds.includes(entry.id)) continue;
      if ("category" in typedPatch) entry.category = typedPatch.category as PageEntry["category"];
      if ("visibleInSearch" in typedPatch) entry.visibleInSearch = typedPatch.visibleInSearch as boolean;
      updated.push(entry);
    }
    return doc;
  });

  await recordActivity(env.PAGES_BUCKET, {
    actorEmail: locals.user!.email,
    action: "pages.batch_updated",
    targetId: uniqueIds.join(","),
    targetLabel: `${updated.length} page${updated.length > 1 ? "s" : ""}`,
    details: {
      patch: typedPatch,
      pages: updated.map((p) => ({ id: p.id, path: Object.values(p.locales)[0]?.publishedPath })),
    },
  });

  return json(200, { ok: true, updated });
};
