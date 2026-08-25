import type { Category } from "../config/categories";

export interface LocalizedPageContent {
  // lecture seule — écrit uniquement par le webhook Webflow
  slug: string; // identifiant stable de la page, sans le préfixe de langue
  publishedPath: string; // chemin routé réel (avec préfixe de langue), pour l'affichage/les liens
  webflowTitle: string;
  webflowMetaDescription: string;

  // éditable — écrit uniquement par PATCH /api/pages/:id (avec localeId)
  title: string | null;
  summary: string | null;
}

export interface PageEntry {
  // partagé entre langues (ID de page/item Webflow) — lecture seule
  id: string;
  lastPublishedAt: string; // ISO

  // page statique ou item de collection CMS — détermine comment le webhook
  // resynchronise cette entrée (re-liste complète vs upsert incrémental) et
  // sert d'affichage dans l'admin. `collectionId` est non-null seulement si
  // kind === "cms".
  kind: "page" | "cms";
  collectionId: string | null;

  // niveau page, pas par langue — éditable via PATCH /api/pages/:id
  category: Category | null;
  visibleInSearch: boolean;

  // contenu par langue, clé = localeId Webflow
  locales: Record<string, LocalizedPageContent>;
}

export interface PagesDocument {
  schemaVersion: 1;
  updatedAt: string;
  pages: PageEntry[];
}

export const PAGES_OBJECT_KEY = "pages.json";

function emptyDocument(): PagesDocument {
  return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), pages: [] };
}

export async function readPagesDoc(
  bucket: R2Bucket
): Promise<{ doc: PagesDocument; etag: string | null }> {
  const obj = await bucket.get(PAGES_OBJECT_KEY);
  if (!obj) {
    return { doc: emptyDocument(), etag: null };
  }
  const doc = await obj.json<PagesDocument>();
  return { doc, etag: obj.etag };
}

/**
 * Read-modify-write with optimistic concurrency: retries against a fresh
 * read if another writer (webhook vs. admin PATCH) changed the object first.
 */
export async function writePagesDoc(
  bucket: R2Bucket,
  mutate: (doc: PagesDocument) => PagesDocument,
  maxAttempts = 3
): Promise<PagesDocument> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { doc, etag } = await readPagesDoc(bucket);
    const next = mutate(doc);
    next.updatedAt = new Date().toISOString();
    const putOptions = etag ? { onlyIf: { etagMatches: etag } } : undefined;
    try {
      const result = await bucket.put(PAGES_OBJECT_KEY, JSON.stringify(next), putOptions);
      if (result) return next;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `Failed to write ${PAGES_OBJECT_KEY} after ${maxAttempts} concurrent-write retries`,
    { cause: lastError }
  );
}
