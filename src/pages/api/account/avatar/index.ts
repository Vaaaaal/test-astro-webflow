import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { writeProfilesDoc } from "../../../../lib/profilesStore";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_SIZE_BYTES = 512 * 1024;

function avatarKey(email: string): string {
  return `avatars/${email}`;
}

async function setHasAvatar(email: string, hasAvatar: boolean) {
  await writeProfilesDoc(env.PAGES_BUCKET, (doc) => {
    const idx = doc.profiles.findIndex((p) => p.email === email);
    if (idx === -1) {
      doc.profiles.push({ email, name: null, hasAvatar });
    } else {
      doc.profiles[idx].hasAvatar = hasAvatar;
    }
    return doc;
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user!; // guaranteed by API_RULES: /api/account requires editor+

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("avatar");
  if (!formData || !(file instanceof File)) {
    return json(400, { error: "missing_file" });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return json(422, { error: "invalid_file_type", allowed: [...ALLOWED_TYPES] });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return json(422, { error: "file_too_large", max: MAX_SIZE_BYTES });
  }

  await env.PAGES_BUCKET.put(avatarKey(user.email), await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });
  await setHasAvatar(user.email, true);

  return json(200, { ok: true });
};

export const DELETE: APIRoute = async ({ locals }) => {
  const user = locals.user!;
  await env.PAGES_BUCKET.delete(avatarKey(user.email));
  await setHasAvatar(user.email, false);
  return json(200, { ok: true });
};
