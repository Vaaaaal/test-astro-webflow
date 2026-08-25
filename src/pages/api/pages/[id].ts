import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { readPagesDoc, writePagesDoc, type PageEntry } from "../../../lib/pagesStore";
import { CATEGORIES } from "../../../config/categories";

const EDITABLE_KEYS = ["localeId", "title", "summary", "category", "visibleInSearch"] as const;
type EditableKey = (typeof EDITABLE_KEYS)[number];
const LOCALE_SCOPED_KEYS = ["title", "summary"] as const;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const PATCH: APIRoute = async ({ params, request }) => {
  const id = params.id;
  if (!id) {
    return json(400, { error: "missing_id" });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json(400, { error: "invalid_json" });
  }

  for (const key of Object.keys(body)) {
    if (!EDITABLE_KEYS.includes(key as EditableKey)) {
      return json(400, { error: "read_only_field", field: key });
    }
  }

  const patch = body as Partial<Record<EditableKey, unknown>>;

  const touchesLocaleScopedField = LOCALE_SCOPED_KEYS.some((key) => key in patch);
  if (touchesLocaleScopedField && typeof patch.localeId !== "string") {
    return json(422, { error: "missing_locale_id" });
  }

  if ("category" in patch && patch.category !== null && !CATEGORIES.includes(patch.category as any)) {
    return json(422, { error: "invalid_category", allowed: CATEGORIES });
  }

  for (const key of LOCALE_SCOPED_KEYS) {
    if (key in patch && patch[key] !== null && typeof patch[key] !== "string") {
      return json(422, { error: "invalid_field", field: key });
    }
  }

  if ("visibleInSearch" in patch && typeof patch.visibleInSearch !== "boolean") {
    return json(422, { error: "invalid_field", field: "visibleInSearch" });
  }

  const maxLengths: Record<"title" | "summary", number> = { title: 200, summary: 2000 };
  for (const key of LOCALE_SCOPED_KEYS) {
    const value = patch[key];
    if (typeof value === "string" && value.length > maxLengths[key]) {
      return json(422, { error: "field_too_long", field: key, max: maxLengths[key] });
    }
  }

  const { doc: existingDoc } = await readPagesDoc(env.PAGES_BUCKET);
  const existingEntry = existingDoc.pages.find((p) => p.id === id);
  if (!existingEntry) {
    return json(404, { error: "not_found" });
  }
  if (touchesLocaleScopedField && !existingEntry.locales[patch.localeId as string]) {
    return json(404, { error: "locale_not_found" });
  }

  let updated: PageEntry | null = null;
  await writePagesDoc(env.PAGES_BUCKET, (doc) => {
    const idx = doc.pages.findIndex((p) => p.id === id);
    if (idx === -1) return doc;
    const entry = doc.pages[idx];

    if ("category" in patch) entry.category = patch.category as PageEntry["category"];
    if ("visibleInSearch" in patch) entry.visibleInSearch = patch.visibleInSearch as boolean;

    if (touchesLocaleScopedField) {
      const localeId = patch.localeId as string;
      const localeContent = entry.locales[localeId];
      if (localeContent) {
        if ("title" in patch) localeContent.title = patch.title as string | null;
        if ("summary" in patch) localeContent.summary = patch.summary as string | null;
      }
    }

    updated = entry;
    return doc;
  });

  if (!updated) {
    return json(404, { error: "not_found" });
  }
  return json(200, { ok: true, entry: updated });
};
