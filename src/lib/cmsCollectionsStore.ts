export interface CmsCollectionEntry {
  collectionId: string;
  summaryField: string | null; // fieldData key used as the search summary
  defaultCategory: string | null; // references CategoryEntry.key
}

export interface CmsCollectionsDocument {
  schemaVersion: 1;
  updatedAt: string;
  collections: CmsCollectionEntry[];
}

export const CMS_COLLECTIONS_OBJECT_KEY = "cmsCollections.json";

function emptyDocument(): CmsCollectionsDocument {
  return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), collections: [] };
}

export async function readCmsCollectionsDoc(
  bucket: R2Bucket
): Promise<{ doc: CmsCollectionsDocument; etag: string | null }> {
  const obj = await bucket.get(CMS_COLLECTIONS_OBJECT_KEY);
  if (!obj) {
    return { doc: emptyDocument(), etag: null };
  }
  const doc = await obj.json<CmsCollectionsDocument>();
  return { doc, etag: obj.etag };
}

/**
 * Read-modify-write with optimistic concurrency, same pattern as
 * pagesStore.ts's writePagesDoc.
 */
export async function writeCmsCollectionsDoc(
  bucket: R2Bucket,
  mutate: (doc: CmsCollectionsDocument) => CmsCollectionsDocument,
  maxAttempts = 3
): Promise<CmsCollectionsDocument> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { doc, etag } = await readCmsCollectionsDoc(bucket);
    const next = mutate(doc);
    next.updatedAt = new Date().toISOString();
    const putOptions = etag ? { onlyIf: { etagMatches: etag } } : undefined;
    try {
      const result = await bucket.put(CMS_COLLECTIONS_OBJECT_KEY, JSON.stringify(next), putOptions);
      if (result) return next;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `Failed to write ${CMS_COLLECTIONS_OBJECT_KEY} after ${maxAttempts} concurrent-write retries`,
    { cause: lastError }
  );
}

export function findCmsCollection(
  doc: CmsCollectionsDocument,
  collectionId: string
): CmsCollectionEntry | null {
  return doc.collections.find((c) => c.collectionId === collectionId) ?? null;
}
