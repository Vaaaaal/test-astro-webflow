import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { isValidEmail, normalizeEmail, parseSuperAdminEmails } from "../../../config/roles";
import { readUsersDoc, findUser } from "../../../lib/usersStore";
import { createEmailChangeToken } from "../../../lib/authTokens";
import { sendEmailChangeConfirmationEmail } from "../../../lib/resendClient";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user!; // guaranteed by API_RULES: /api/account requires editor+

  // Bootstrap super_admins have no users.json entry — their access is granted
  // purely via the SUPER_ADMIN_EMAILS env var, which self-service can't touch.
  // No code path ever assigns "super_admin" through users.json (see
  // SELECTABLE_ROLES/assignableRoles in config/roles.ts), so this check alone
  // reliably identifies them.
  if (user.role === "super_admin") {
    return json(403, { error: "bootstrap_super_admin" });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof (body as any).newEmail !== "string") {
    return json(400, { error: "invalid_json" });
  }

  const newEmail = normalizeEmail((body as { newEmail: string }).newEmail);
  if (!isValidEmail(newEmail)) {
    return json(422, { error: "invalid_email" });
  }
  if (newEmail === user.email) {
    return json(422, { error: "same_email" });
  }
  if (parseSuperAdminEmails(env.SUPER_ADMIN_EMAILS).has(newEmail)) {
    return json(422, { error: "email_taken" });
  }

  const { doc } = await readUsersDoc(env.PAGES_BUCKET);
  if (findUser(doc, newEmail)) {
    return json(422, { error: "email_taken" });
  }

  const token = await createEmailChangeToken(env.AUTH_TOKENS, user.email, newEmail);
  const origin = new URL(request.url).origin;
  const confirmUrl = `${origin}${BASE}/api/auth/confirm-email-change?token=${token}`;

  if (import.meta.env.DEV) {
    console.log(`[dev] Email change confirmation for ${newEmail}: ${confirmUrl}`);
    return json(200, { ok: true, devConfirmUrl: confirmUrl });
  }

  try {
    await sendEmailChangeConfirmationEmail({
      apiKey: env.RESEND_API_KEY,
      from: env.EMAIL_FROM_ADDRESS,
      to: newEmail,
      currentEmail: user.email,
      confirmUrl,
    });
  } catch (err) {
    console.error("Failed to send email-change confirmation:", err);
    return json(502, { error: "email_send_failed" });
  }

  return json(200, { ok: true });
};
