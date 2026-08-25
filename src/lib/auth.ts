import { env } from "cloudflare:workers";
import { parseSuperAdminEmails, normalizeEmail, type Role } from "../config/roles";
import { readUsersDoc, findUser } from "./usersStore";

export interface AuthenticatedUser {
  email: string;
  role: Role;
}

/**
 * Resolves a normalized email to its current role, checked fresh on every
 * call (never cached in the session) — otherwise a role change or account
 * deletion by an admin wouldn't take effect until the affected user's next
 * login. Bootstrap SUPER_ADMIN_EMAILS always wins over users.json.
 */
export async function resolveUser(email: string): Promise<AuthenticatedUser | null> {
  const normalized = normalizeEmail(email);
  if (parseSuperAdminEmails(env.SUPER_ADMIN_EMAILS).has(normalized)) {
    return { email: normalized, role: "super_admin" };
  }
  const { doc } = await readUsersDoc(env.PAGES_BUCKET);
  const entry = findUser(doc, normalized);
  return entry ? { email: normalized, role: entry.role } : null;
}
