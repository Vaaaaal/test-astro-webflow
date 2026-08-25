import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { isValidEmail, normalizeEmail } from "../../../config/roles";
import { resolveUser } from "../../../lib/auth";
import { createMagicLinkToken } from "../../../lib/authTokens";
import { sendMagicLinkEmail } from "../../../lib/resendClient";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof (body as any).email !== "string") {
    return json(400, { error: "invalid_json" });
  }

  const email = normalizeEmail((body as { email: string }).email);
  if (!isValidEmail(email)) {
    return json(422, { error: "invalid_email" });
  }

  const user = await resolveUser(email);

  // Anti-enumeration: always respond the same way, whether the email is
  // recognized or not. Only do the extra work (token + send) if it is.
  let devMagicLinkUrl: string | undefined;

  if (user) {
    const token = await createMagicLinkToken(env.AUTH_TOKENS, user.email);
    const origin = new URL(request.url).origin;
    const magicLinkUrl = `${origin}${BASE}/api/auth/verify?token=${token}`;

    if (import.meta.env.DEV) {
      console.log(`[dev] Magic link for ${user.email}: ${magicLinkUrl}`);
      devMagicLinkUrl = magicLinkUrl;
    } else {
      try {
        await sendMagicLinkEmail({
          apiKey: env.RESEND_API_KEY,
          from: env.EMAIL_FROM_ADDRESS,
          to: user.email,
          magicLinkUrl,
        });
      } catch (err) {
        console.error("Failed to send magic link email:", err);
      }
    }
  }

  return json(200, { ok: true, ...(devMagicLinkUrl ? { devMagicLinkUrl } : {}) });
};
