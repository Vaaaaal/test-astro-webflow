import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { normalizeEmail } from "../../../../config/roles";

export const GET: APIRoute = async ({ params }) => {
  const email = params.email ? normalizeEmail(decodeURIComponent(params.email)) : "";
  if (!email) {
    return new Response(null, { status: 400 });
  }

  const obj = await env.PAGES_BUCKET.get(`avatars/${email}`);
  if (!obj) {
    return new Response(null, { status: 404 });
  }

  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=300",
    },
  });
};
