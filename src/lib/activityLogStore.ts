export interface ActivityEntry {
  id: string; // crypto.randomUUID() — no natural key for a log event
  timestamp: string; // ISO
  actorEmail: string;
  action: string;
  targetId: string; // page id, category key, collection id, or user email
  // Human-readable snapshot at the time of the action — the target may
  // later be renamed/deleted, this keeps the history entry meaningful.
  targetLabel: string;
  details?: Record<string, unknown>;
}

export interface ActivityLogDocument {
  schemaVersion: 1;
  updatedAt: string;
  entries: ActivityEntry[];
}

function objectKeyForMonth(monthKey: string): string {
  return `activity/${monthKey}.json`;
}

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7); // "2026-08"
}

function emptyDocument(): ActivityLogDocument {
  return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), entries: [] };
}

export async function readActivityDoc(
  bucket: R2Bucket,
  monthKey: string
): Promise<{ doc: ActivityLogDocument; etag: string | null }> {
  const obj = await bucket.get(objectKeyForMonth(monthKey));
  if (!obj) {
    return { doc: emptyDocument(), etag: null };
  }
  const doc = await obj.json<ActivityLogDocument>();
  return { doc, etag: obj.etag };
}

/**
 * Read-modify-write with optimistic concurrency, same pattern as
 * pagesStore.ts's writePagesDoc — parameterized by month instead of a
 * single fixed key, since this store is append-only and unbounded (unlike
 * every other store here, which holds a small bounded "current state" set).
 * Only the current month sees frequent writes; past months are effectively
 * closed once the calendar rolls over.
 */
export async function writeActivityDoc(
  bucket: R2Bucket,
  monthKey: string,
  mutate: (doc: ActivityLogDocument) => ActivityLogDocument,
  maxAttempts = 3
): Promise<ActivityLogDocument> {
  const key = objectKeyForMonth(monthKey);
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { doc, etag } = await readActivityDoc(bucket, monthKey);
    const next = mutate(doc);
    next.updatedAt = new Date().toISOString();
    const putOptions = etag ? { onlyIf: { etagMatches: etag } } : undefined;
    try {
      const result = await bucket.put(key, JSON.stringify(next), putOptions);
      if (result) return next;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Failed to write ${key} after ${maxAttempts} concurrent-write retries`, {
    cause: lastError,
  });
}

export interface RecordActivityInput {
  actorEmail: string;
  action: string;
  targetId: string;
  targetLabel: string;
  details?: Record<string, unknown>;
}

/**
 * Best-effort: called after the actual mutation already succeeded. Never
 * throws — a failed audit-log write shouldn't roll back or fail an
 * otherwise-successful request, since the log is a secondary observability
 * feature, not the critical path (same philosophy as the best-effort email
 * send in request-magic-link.ts).
 */
export async function recordActivity(bucket: R2Bucket, input: RecordActivityInput): Promise<void> {
  try {
    const entry: ActivityEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...input,
    };
    await writeActivityDoc(bucket, currentMonthKey(), (doc) => {
      doc.entries.push(entry);
      return doc;
    });
  } catch (err) {
    console.error("Failed to record activity log entry:", err);
  }
}
