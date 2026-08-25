import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { resolveUser } from "../../../lib/auth";
import { consumeMagicLinkToken } from "../../../lib/authTokens";

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

export const GET: APIRoute = async ({ request, session, redirect }) => {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return redirect(`${BASE}/login?error=missing_token`);
  }

  const email = await consumeMagicLinkToken(env.AUTH_TOKENS, token);
  if (!email) {
    return redirect(`${BASE}/login?error=invalid_or_expired_token`);
  }

  // Re-check authorization at verify time, not just at request time — covers
  // the case where access was revoked in the window between request and click.
  const user = await resolveUser(email);
  if (!user) {
    return redirect(`${BASE}/login?error=not_authorized`);
  }

  await session?.regenerate(); // rotate session ID, prevents session fixation
  session?.set("userEmail", user.email);

  return redirect(`${BASE}/admin`);
};
