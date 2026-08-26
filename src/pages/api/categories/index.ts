import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { readCategoriesDoc, writeCategoriesDoc, type CategoryEntry } from "../../../lib/categoriesStore";

const KEY_PATTERN = /^[a-z0-9-]+$/;

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

export const GET: APIRoute = async () => {
  const { doc } = await readCategoriesDoc(env.PAGES_BUCKET);
  return json(200, doc.categories);
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json(400, { error: "invalid_json" });
  }
  const { key, adminLabel, localeLabels, prefixes } = body as {
    key?: unknown;
    adminLabel?: unknown;
    localeLabels?: unknown;
    prefixes?: unknown;
  };

  if (typeof key !== "string" || !KEY_PATTERN.test(key)) {
    return json(422, { error: "invalid_key", detail: "lowercase letters, numbers, hyphens only" });
  }
  if (typeof adminLabel !== "string" || adminLabel.trim().length === 0) {
    return json(422, { error: "invalid_admin_label" });
  }
  if (localeLabels !== undefined && !isStringRecord(localeLabels)) {
    return json(422, { error: "invalid_locale_labels" });
  }
  if (prefixes !== undefined && !isStringRecord(prefixes)) {
    return json(422, { error: "invalid_prefixes" });
  }

  const { doc: existingDoc } = await readCategoriesDoc(env.PAGES_BUCKET);
  if (existingDoc.categories.some((c) => c.key === key)) {
    return json(409, { error: "already_exists" });
  }

  const entry: CategoryEntry = {
    key,
    adminLabel,
    localeLabels: (localeLabels as Record<string, string> | undefined) ?? {},
    prefixes: (prefixes as Record<string, string> | undefined) ?? {},
  };

  const doc = await writeCategoriesDoc(env.PAGES_BUCKET, (doc) => {
    doc.categories.push(entry);
    return doc;
  });

  return json(201, { ok: true, entry: doc.categories.find((c) => c.key === key) });
};
