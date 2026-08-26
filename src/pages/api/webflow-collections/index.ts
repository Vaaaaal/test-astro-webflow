import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  listSiteCollections,
  getCollectionFields,
  getCollectionPagePath,
} from "../../../lib/webflowClient";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Same fields as what the real proxy below returns (see WebflowCollectionSummary
// + enrichment) — one collection with a live base path, one without (page
// never built in the Designer), matching both states seen against a real
// site, so the admin UI's two branches are both exercisable locally.
const DEV_MOCK_COLLECTIONS = [
  {
    id: "dev-mock-blog",
    displayName: "Blog Posts",
    slug: "post",
    fields: [
      { slug: "name", displayName: "Name" },
      { slug: "slug", displayName: "Slug" },
      { slug: "post-summary", displayName: "Post Summary" },
      { slug: "post-body", displayName: "Post Body" },
    ],
    basePath: "/post",
  },
  {
    id: "dev-mock-events",
    displayName: "Events",
    slug: "event",
    fields: [
      { slug: "name", displayName: "Name" },
      { slug: "slug", displayName: "Slug" },
      { slug: "short-description", displayName: "Short description" },
    ],
    basePath: null,
  },
];

// Live proxy to Webflow's own Collections API, for the admin "add a CMS
// collection" picker — so an admin can pick a real collection instead of
// hand-typing a collectionId, and see its fields (for summaryField) and
// detected base path without leaving the page.
export const GET: APIRoute = async () => {
  // Local dev without real Webflow credentials configured — let the page be
  // exercised via seed data alone, same spirit as request-magic-link never
  // calling Resend in dev. If real credentials ARE set in .dev.vars, still
  // hit the real API so testing against the actual site stays possible.
  if (import.meta.env.DEV && (!env.WEBFLOW_API_TOKEN || !env.WEBFLOW_SITE_ID)) {
    return json(200, DEV_MOCK_COLLECTIONS);
  }

  let collections;
  try {
    collections = await listSiteCollections(env.WEBFLOW_SITE_ID, env.WEBFLOW_API_TOKEN);
  } catch (err) {
    return json(502, {
      error: "webflow_api_error",
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  const enriched = await Promise.all(
    collections.map(async (collection) => {
      const [fields, basePath] = await Promise.all([
        getCollectionFields(collection.id, env.WEBFLOW_API_TOKEN).catch(() => []),
        getCollectionPagePath(env.WEBFLOW_SITE_ID, collection.id, env.WEBFLOW_API_TOKEN).catch(
          () => null
        ),
      ]);
      return { ...collection, fields, basePath };
    })
  );

  return json(200, enriched);
};
