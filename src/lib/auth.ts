import { env } from "cloudflare:workers";
import { parseSuperAdminEmails, normalizeEmail, type Role } from "../config/roles";
import { readUsersDoc, findUser } from "./usersStore";
import { readProfilesDoc, findProfile } from "./profilesStore";

export interface AuthenticatedUser {
  email: string;
  role: Role;
  // Profile metadata (profilesStore.ts) — kept separate from role/access so
  // it can never grant access, including for bootstrap super_admins who
  // have no users.json entry at all.
  name: string | null;
  hasAvatar: boolean;
}

/**
 * Resolves a normalized email to its current role, checked fresh on every
 * call (never cached in the session) — otherwise a role change or account
 * deletion by an admin wouldn't take effect until the affected user's next
 * login. Bootstrap SUPER_ADMIN_EMAILS always wins over users.json.
 */
export async function resolveUser(email: string): Promise<AuthenticatedUser | null> {
  const normalized = normalizeEmail(email);
  const { doc: profilesDoc } = await readProfilesDoc(env.PAGES_BUCKET);
  const profile = findProfile(profilesDoc, normalized);
  const name = profile?.name ?? null;
  const hasAvatar = profile?.hasAvatar ?? false;

  if (parseSuperAdminEmails(env.SUPER_ADMIN_EMAILS).has(normalized)) {
    return { email: normalized, role: "super_admin", name, hasAvatar };
  }
  const { doc } = await readUsersDoc(env.PAGES_BUCKET);
  const entry = findUser(doc, normalized);
  return entry ? { email: normalized, role: entry.role, name, hasAvatar } : null;
}
