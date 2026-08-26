import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { writeProfilesDoc } from "../../../lib/profilesStore";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const MAX_NAME_LENGTH = 200;

export const PATCH: APIRoute = async ({ request, locals }) => {
  const user = locals.user!; // guaranteed by API_RULES: /api/account requires editor+

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json(400, { error: "invalid_json" });
  }

  const { name } = body as { name?: unknown };
  if (name !== undefined && name !== null && typeof name !== "string") {
    return json(422, { error: "invalid_field", field: "name" });
  }
  if (typeof name === "string" && name.length > MAX_NAME_LENGTH) {
    return json(422, { error: "field_too_long", field: "name", max: MAX_NAME_LENGTH });
  }

  const nextName = typeof name === "string" && name.trim() ? name.trim() : null;

  const doc = await writeProfilesDoc(env.PAGES_BUCKET, (doc) => {
    const idx = doc.profiles.findIndex((p) => p.email === user.email);
    if (idx === -1) {
      doc.profiles.push({ email: user.email, name: nextName, hasAvatar: false });
    } else {
      doc.profiles[idx].name = nextName;
    }
    return doc;
  });

  const profile = doc.profiles.find((p) => p.email === user.email)!;
  return json(200, { ok: true, profile });
};
