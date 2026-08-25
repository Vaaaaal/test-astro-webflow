export const ROLES = ["editor", "admin", "super_admin"] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { editor: 0, admin: 1, super_admin: 2 };

export function roleAtLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

/**
 * Can an actor with `actorRole` create/edit/delete a user who currently has
 * (or would be assigned) `targetRole`? super_admin manages everyone; admin
 * manages editor/admin only, never super_admin; editor manages no one.
 */
export function canManageUserWithRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === "super_admin") return true;
  if (actorRole === "admin") return targetRole !== "super_admin";
  return false;
}

/** Roles `actorRole` is allowed to assign — drives the role <Select> in the UI. */
export function assignableRoles(actorRole: Role): Role[] {
  return ROLES.filter((r) => canManageUserWithRole(actorRole, r));
}

export function parseSuperAdminEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}
