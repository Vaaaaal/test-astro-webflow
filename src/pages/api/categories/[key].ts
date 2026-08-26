import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { readCategoriesDoc, writeCategoriesDoc, type CategoryEntry } from "../../../lib/categoriesStore";
import { writePagesDoc } from "../../../lib/pagesStore";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((v) => typeof v === "string");
}

export const PATCH: APIRoute = async ({ params, request }) => {
  const key = params.key;
  if (!key) return json(400, { error: "missing_key" });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json(400, { error: "invalid_json" });
  }
  const { adminLabel, localeLabels, prefixes } = body as {
    adminLabel?: unknown;
    localeLabels?: unknown;
    prefixes?: unknown;
  };

  if (adminLabel !== undefined && (typeof adminLabel !== "string" || adminLabel.trim().length === 0)) {
    return json(422, { error: "invalid_admin_label" });
  }
  if (localeLabels !== undefined && !isStringRecord(localeLabels)) {
    return json(422, { error: "invalid_locale_labels" });
  }
  if (prefixes !== undefined && !isStringRecord(prefixes)) {
    return json(422, { error: "invalid_prefixes" });
  }

  const { doc: existingDoc } = await readCategoriesDoc(env.PAGES_BUCKET);
  if (!existingDoc.categories.some((c) => c.key === key)) {
    return json(404, { error: "not_found" });
  }

  let updated: CategoryEntry | null = null;
  await writeCategoriesDoc(env.PAGES_BUCKET, (doc) => {
    const idx = doc.categories.findIndex((c) => c.key === key);
    if (idx === -1) return doc;
    const category = doc.categories[idx];
    if (typeof adminLabel === "string") category.adminLabel = adminLabel;
    if (localeLabels !== undefined) category.localeLabels = localeLabels as Record<string, string>;
    if (prefixes !== undefined) category.prefixes = prefixes as Record<string, string>;
    updated = category;
    return doc;
  });

  if (!updated) return json(404, { error: "not_found" });
  return json(200, { ok: true, entry: updated });
};

export const DELETE: APIRoute = async ({ params }) => {
  const key = params.key;
  if (!key) return json(400, { error: "missing_key" });

  const { doc: existingDoc } = await readCategoriesDoc(env.PAGES_BUCKET);
  if (!existingDoc.categories.some((c) => c.key === key)) {
    return json(404, { error: "not_found" });
  }

  await writeCategoriesDoc(env.PAGES_BUCKET, (doc) => {
    doc.categories = doc.categories.filter((c) => c.key !== key);
    return doc;
  });

  // Pages tagged with a category that no longer exists fall back to no
  // category — already a fully-supported state everywhere (shown "—",
  // filterable) — rather than blocking deletion or reassigning arbitrarily.
  let clearedCount = 0;
  await writePagesDoc(env.PAGES_BUCKET, (doc) => {
    for (const page of doc.pages) {
      if (page.category === key) {
        page.category = null;
        clearedCount++;
      }
    }
    return doc;
  });

  return json(200, { ok: true, clearedPages: clearedCount });
};
