import type { Role } from "../config/roles";

export interface UserEntry {
  email: string; // normalized (trim+lowercase), unique key
  role: Role;
  addedBy: string; // email of the admin/super_admin who created this entry
  createdAt: string; // ISO
}

export interface UsersDocument {
  schemaVersion: 1;
  updatedAt: string;
  users: UserEntry[];
}

export const USERS_OBJECT_KEY = "users.json";

function emptyDocument(): UsersDocument {
  return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), users: [] };
}

export async function readUsersDoc(
  bucket: R2Bucket
): Promise<{ doc: UsersDocument; etag: string | null }> {
  const obj = await bucket.get(USERS_OBJECT_KEY);
  if (!obj) {
    return { doc: emptyDocument(), etag: null };
  }
  const doc = await obj.json<UsersDocument>();
  return { doc, etag: obj.etag };
}

/**
 * Read-modify-write with optimistic concurrency, same pattern as
 * pagesStore.ts's writePagesDoc.
 */
export async function writeUsersDoc(
  bucket: R2Bucket,
  mutate: (doc: UsersDocument) => UsersDocument,
  maxAttempts = 3
): Promise<UsersDocument> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { doc, etag } = await readUsersDoc(bucket);
    const next = mutate(doc);
    next.updatedAt = new Date().toISOString();
    const putOptions = etag ? { onlyIf: { etagMatches: etag } } : undefined;
    try {
      const result = await bucket.put(USERS_OBJECT_KEY, JSON.stringify(next), putOptions);
      if (result) return next;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `Failed to write ${USERS_OBJECT_KEY} after ${maxAttempts} concurrent-write retries`,
    { cause: lastError }
  );
}

export function findUser(doc: UsersDocument, email: string): UserEntry | null {
  return doc.users.find((u) => u.email === email) ?? null;
}
