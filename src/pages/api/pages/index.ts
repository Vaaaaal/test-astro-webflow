import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { readPagesDoc } from "../../../lib/pagesStore";

export const GET: APIRoute = async () => {
  const { doc } = await readPagesDoc(env.PAGES_BUCKET);
  return new Response(JSON.stringify(doc.pages), {
    headers: { "Content-Type": "application/json" },
  });
};
