import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { readLocalesDoc } from "../../../lib/localesStore";

export const GET: APIRoute = async () => {
  const doc = await readLocalesDoc(env.PAGES_BUCKET);
  return new Response(JSON.stringify(doc.locales), {
    headers: { "Content-Type": "application/json" },
  });
};
