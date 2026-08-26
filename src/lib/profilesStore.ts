export interface ProfileEntry {
  email: string; // normalized, unique key — purely descriptive, never grants access
  name: string | null;
  hasAvatar: boolean;
}

export interface ProfilesDocument {
  schemaVersion: 1;
  updatedAt: string;
  profiles: ProfileEntry[];
}

export const PROFILES_OBJECT_KEY = "profiles.json";

function emptyDocument(): ProfilesDocument {
  return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), profiles: [] };
}

export async function readProfilesDoc(
  bucket: R2Bucket
): Promise<{ doc: ProfilesDocument; etag: string | null }> {
  const obj = await bucket.get(PROFILES_OBJECT_KEY);
  if (!obj) {
    return { doc: emptyDocument(), etag: null };
  }
  const doc = await obj.json<ProfilesDocument>();
  return { doc, etag: obj.etag };
}

/**
 * Read-modify-write with optimistic concurrency, same pattern as
 * pagesStore.ts's writePagesDoc.
 */
export async function writeProfilesDoc(
  bucket: R2Bucket,
  mutate: (doc: ProfilesDocument) => ProfilesDocument,
  maxAttempts = 3
): Promise<ProfilesDocument> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { doc, etag } = await readProfilesDoc(bucket);
    const next = mutate(doc);
    next.updatedAt = new Date().toISOString();
    const putOptions = etag ? { onlyIf: { etagMatches: etag } } : undefined;
    try {
      const result = await bucket.put(PROFILES_OBJECT_KEY, JSON.stringify(next), putOptions);
      if (result) return next;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `Failed to write ${PROFILES_OBJECT_KEY} after ${maxAttempts} concurrent-write retries`,
    { cause: lastError }
  );
}

export function findProfile(doc: ProfilesDocument, email: string): ProfileEntry | null {
  return doc.profiles.find((p) => p.email === email) ?? null;
}
