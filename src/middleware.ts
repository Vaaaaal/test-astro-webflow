import { defineMiddleware } from "astro:middleware";
import { roleAtLeast, type Role } from "./config/roles";
import { resolveUser } from "./lib/auth";

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

// `request.url` / `context.url` always carry the base prefix (confirmed
// empirically in dev — Astro only strips it internally for route matching,
// not on the URL exposed to middleware), so route rules below match against
// the base-stripped pathname.
function stripBase(pathname: string): string {
  if (BASE && pathname.startsWith(BASE)) {
    return pathname.slice(BASE.length) || "/";
  }
  return pathname;
}

interface Rule {
  prefix: string;
  minRole: Role;
  // Stricter role required for mutating methods (POST/PATCH/DELETE/PUT);
  // defaults to minRole. Lets a resource be editor-readable (e.g. an editor
  // picking a category while editing a page) but admin-writable (managing
  // the taxonomy itself) without scattering inline role checks per route.
  writeMinRole?: Role;
}

const PAGE_RULES: Rule[] = [
  { prefix: "/admin/users", minRole: "admin" },
  { prefix: "/admin/categories", minRole: "admin" },
  { prefix: "/admin/collections", minRole: "admin" },
  { prefix: "/admin", minRole: "editor" },
];

const API_RULES: Rule[] = [
  { prefix: "/api/users", minRole: "admin" },
  { prefix: "/api/pages", minRole: "editor" },
  { prefix: "/api/locales", minRole: "editor" },
  { prefix: "/api/categories", minRole: "editor", writeMinRole: "admin" },
  { prefix: "/api/cms-collections", minRole: "editor", writeMinRole: "admin" },
  { prefix: "/api/webflow-collections", minRole: "admin" },
];

const READ_METHODS = new Set(["GET", "HEAD"]);

function matchRule(rules: Rule[], path: string): Rule | undefined {
  return rules
    .filter((r) => path === r.prefix || path.startsWith(r.prefix + "/"))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const path = stripBase(new URL(context.request.url).pathname);

  const email = await context.session?.get("userEmail");
  context.locals.user = email ? await resolveUser(email) : null;

  const apiRule = matchRule(API_RULES, path);
  if (apiRule) {
    if (!context.locals.user) return json(401, { error: "unauthenticated" });
    const requiredRole = READ_METHODS.has(context.request.method)
      ? apiRule.minRole
      : (apiRule.writeMinRole ?? apiRule.minRole);
    if (!roleAtLeast(context.locals.user.role, requiredRole)) {
      return json(403, { error: "forbidden" });
    }
    return next();
  }

  const pageRule = matchRule(PAGE_RULES, path);
  if (pageRule) {
    if (!context.locals.user) {
      return context.redirect(`${BASE}/login`);
    }
    if (!roleAtLeast(context.locals.user.role, pageRule.minRole)) {
      return context.redirect(`${BASE}/admin`);
    }
  }

  return next();
});
