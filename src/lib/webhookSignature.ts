const REPLAY_WINDOW_MS = 5 * 60 * 1000; // Webflow's own documented tolerance

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verifies a Webflow webhook request per their documented scheme: HMAC-SHA256
 * (hex) of `${timestamp}:${rawBody}` keyed by the webhook's own secret (shown
 * once at creation time in Site settings -> Webhooks — not a value we pick),
 * plus a 5-minute replay window on the timestamp.
 * https://developers.webflow.com/data/reference/request-signatures
 *
 * Accepts multiple candidate secrets because each webhook registered on
 * Webflow (one per triggerType — site_publish, collection_item_published,
 * ...) mints its own distinct secret; a request is valid if it matches ANY
 * of them.
 */
export async function verifyWebflowSignature(
  rawBody: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  secrets: string[],
  now: number = Date.now()
): Promise<boolean> {
  if (!timestampHeader || !signatureHeader || secrets.length === 0) return false;

  // Webflow's docs only check `now - timestamp > window` (too old); rejecting
  // the symmetric case (timestamp implausibly in the future) too is a strictly
  // more conservative replay/clock-skew check that still accepts every
  // legitimately-timed request.
  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > REPLAY_WINDOW_MS) return false;

  for (const secret of secrets) {
    if (!secret) continue;
    const expected = await hmacSha256Hex(secret, `${timestampHeader}:${rawBody}`);
    if (timingSafeEqual(expected, signatureHeader)) return true;
  }
  return false;
}
