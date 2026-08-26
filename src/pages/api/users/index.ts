import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  ROLES,
  canManageUserWithRole,
  isValidEmail,
  normalizeEmail,
  parseSuperAdminEmails,
  type Role,
} from "../../../config/roles";
import { findUser, readUsersDoc, writeUsersDoc } from "../../../lib/usersStore";
import { recordActivity } from "../../../lib/activityLogStore";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET: APIRoute = async () => {
  const { doc } = await readUsersDoc(env.PAGES_BUCKET);
  const bootstrapSuperAdmins = [...parseSuperAdminEmails(env.SUPER_ADMIN_EMAILS)];
  return json(200, { users: doc.users, bootstrapSuperAdmins });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.user!; // guaranteed by middleware (role >= admin)

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json(400, { error: "invalid_json" });
  }
  const { email: rawEmail, role } = body as { email?: unknown; role?: unknown };
  if (typeof rawEmail !== "string" || !isValidEmail(rawEmail)) {
    return json(422, { error: "invalid_email" });
  }
  if (typeof role !== "string" || !ROLES.includes(role as Role)) {
    return json(422, { error: "invalid_role" });
  }
  const email = normalizeEmail(rawEmail);

  if (!canManageUserWithRole(actor.role, role as Role)) {
    return json(403, { error: "escalation_denied" });
  }

  if (parseSuperAdminEmails(env.SUPER_ADMIN_EMAILS).has(email)) {
    return json(400, { error: "already_bootstrap_super_admin" });
  }

  const { doc: existingDoc } = await readUsersDoc(env.PAGES_BUCKET);
  if (findUser(existingDoc, email)) {
    return json(409, { error: "already_exists" });
  }

  const doc = await writeUsersDoc(env.PAGES_BUCKET, (doc) => {
    doc.users.push({
      email,
      role: role as Role,
      addedBy: actor.email,
      createdAt: new Date().toISOString(),
    });
    return doc;
  });

  await recordActivity(env.PAGES_BUCKET, {
    actorEmail: actor.email,
    action: "user.invited",
    targetId: email,
    targetLabel: email,
    details: { role },
  });

  return json(201, { ok: true, entry: findUser(doc, email) });
};
