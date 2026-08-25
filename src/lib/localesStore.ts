export interface LocaleInfo {
  id: string; // localeId Webflow
  tag: string; // ex. "fr-FR"
  displayName: string;
  subdirectory: string;
  isPrimary: boolean;
}

export interface LocalesDocument {
  schemaVersion: 1;
  updatedAt: string;
  locales: LocaleInfo[];
}

export const LOCALES_OBJECT_KEY = "locales.json";

function emptyDocument(): LocalesDocument {
  return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), locales: [] };
}

export async function readLocalesDoc(bucket: R2Bucket): Promise<LocalesDocument> {
  const obj = await bucket.get(LOCALES_OBJECT_KEY);
  if (!obj) return emptyDocument();
  return obj.json<LocalesDocument>();
}

/**
 * Full overwrite — only the webhook writes this document, always as a fresh
 * resync from Webflow's own locale configuration, so there's no concurrent
 * editor to reconcile against (unlike pagesStore's read-modify-write).
 */
export async function writeLocalesDoc(bucket: R2Bucket, locales: LocaleInfo[]): Promise<void> {
  const doc: LocalesDocument = { schemaVersion: 1, updatedAt: new Date().toISOString(), locales };
  await bucket.put(LOCALES_OBJECT_KEY, JSON.stringify(doc));
}
