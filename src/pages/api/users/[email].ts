import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ROLES, canManageUserWithRole, normalizeEmail, type Role } from "../../../config/roles";
import { findUser, readUsersDoc, writeUsersDoc, type UserEntry } from "../../../lib/usersStore";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const actor = locals.user!;
  const targetEmail = normalizeEmail(decodeURIComponent(params.email ?? ""));
  if (!targetEmail) return json(400, { error: "missing_email" });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json(400, { error: "invalid_json" });
  }
  const { role } = body as { role?: unknown };
  if (typeof role !== "string" || !ROLES.includes(role as Role)) {
    return json(422, { error: "invalid_role" });
  }

  // Blanket-block any self role change (not just escalation) — simpler than
  // allowing same-role no-ops, and cleanly covers "cannot self-promote".
  if (targetEmail === actor.email) {
    return json(403, { error: "self_role_change_denied" });
  }

  const { doc: existingDoc } = await readUsersDoc(env.PAGES_BUCKET);
  const existing = findUser(existingDoc, targetEmail);
  if (!existing) return json(404, { error: "not_found" });

  if (!canManageUserWithRole(actor.role, existing.role) || !canManageUserWithRole(actor.role, role as Role)) {
    return json(403, { error: "escalation_denied" });
  }

  let updated: UserEntry | null = null;
  await writeUsersDoc(env.PAGES_BUCKET, (doc) => {
    const idx = doc.users.findIndex((u) => u.email === targetEmail);
    if (idx === -1) return doc;
    doc.users[idx] = { ...doc.users[idx], role: role as Role };
    updated = doc.users[idx];
    return doc;
  });

  if (!updated) return json(404, { error: "not_found" });
  return json(200, { ok: true, entry: updated });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const actor = locals.user!;
  const targetEmail = normalizeEmail(decodeURIComponent(params.email ?? ""));
  if (!targetEmail) return json(400, { error: "missing_email" });

  // Prevents an accidental one-click lockout — applies to admins and
  // super_admins alike.
  if (targetEmail === actor.email) {
    return json(403, { error: "self_delete_denied" });
  }

  const { doc: existingDoc } = await readUsersDoc(env.PAGES_BUCKET);
  const existing = findUser(existingDoc, targetEmail);
  if (!existing) return json(404, { error: "not_found" });

  if (!canManageUserWithRole(actor.role, existing.role)) {
    return json(403, { error: "escalation_denied" });
  }

  await writeUsersDoc(env.PAGES_BUCKET, (doc) => {
    doc.users = doc.users.filter((u) => u.email !== targetEmail);
    return doc;
  });

  return json(200, { ok: true });
};
