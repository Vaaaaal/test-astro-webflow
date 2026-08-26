import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { readActivityDoc } from "../../../lib/activityLogStore";
import { normalizeEmail } from "../../../config/roles";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

export const GET: APIRoute = async ({ url }) => {
  const monthParam = url.searchParams.get("month");
  const month = monthParam && MONTH_PATTERN.test(monthParam) ? monthParam : new Date().toISOString().slice(0, 7);

  const actorParam = url.searchParams.get("actor");
  const actor = actorParam ? normalizeEmail(actorParam) : null;

  const { doc } = await readActivityDoc(env.PAGES_BUCKET, month);
  const entries = (actor ? doc.entries.filter((e) => e.actorEmail === actor) : doc.entries)
    .slice()
    .reverse(); // newest first

  return json(200, { month, entries });
};
