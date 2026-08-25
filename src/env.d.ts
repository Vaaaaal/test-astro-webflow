/* eslint-disable @typescript-eslint/no-empty-interface */
type Runtime = import("@astrojs/cloudflare").Runtime;
type Role = import("./config/roles").Role;

// NOTE: this file has no top-level import/export statement (only inline
// `import(...)` type queries), so it's an ambient script, not a module —
// bare `declare namespace`/`interface` here already merge into the true
// global scope. Don't wrap these in `declare global {}` to "match" Astro's
// own type source: if this file ever gains a real top-level import/export,
// these augmentations would silently stop merging into the global `App`
// namespace.
declare namespace App {
  interface Locals extends Runtime {
    user: { email: string; role: Role } | null;
  }
  interface SessionData {
    userEmail: string;
  }
}

// Secrets that live outside wrangler.json's `vars` (set via `.dev.vars` locally
// and `wrangler secret put` / Webflow Cloud in prod), so `cf-typegen` never sees them.
// `import { env } from "cloudflare:workers"` is typed as `Cloudflare.Env`
// (see worker-configuration.d.ts: `export const env: Cloudflare.Env`), not the
// bare global `Env` — augment the namespaced interface, not the global one.
declare namespace Cloudflare {
  interface Env {
    WEBFLOW_API_TOKEN: string;
    WEBHOOK_SHARED_SECRET: string;
    RESEND_API_KEY: string;
    SUPER_ADMIN_EMAILS: string; // comma-separated, e.g. "a@x.com,b@x.com"
  }
}
