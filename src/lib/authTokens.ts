const TOKEN_TTL_SECONDS = 900; // 15 minutes
const KEY_PREFIX = "magic:";

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateToken(): string {
  const bytes = new Uint8Array(32); // 256 bits
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

interface TokenPayload {
  email: string;
  createdAt: string;
}

export async function createMagicLinkToken(kv: KVNamespace, email: string): Promise<string> {
  const token = generateToken();
  const payload: TokenPayload = { email, createdAt: new Date().toISOString() };
  await kv.put(KEY_PREFIX + token, JSON.stringify(payload), { expirationTtl: TOKEN_TTL_SECONDS });
  return token;
}

/**
 * Single-use: get then delete. Returns the email, or null if the token is
 * missing/expired/malformed.
 *
 * Known limitation: get+delete is not atomic (KV has no compare-and-swap),
 * so two verify requests racing on the same token within a tight window
 * could both succeed. Accepted residual risk for a low-traffic internal
 * tool with a 15-minute single-use link.
 */
export async function consumeMagicLinkToken(kv: KVNamespace, token: string): Promise<string | null> {
  const key = KEY_PREFIX + token;
  const raw = await kv.get(key);
  if (!raw) return null;
  await kv.delete(key);
  try {
    return (JSON.parse(raw) as TokenPayload).email;
  } catch {
    return null;
  }
}

const EMAIL_CHANGE_KEY_PREFIX = "email-change:";

interface EmailChangePayload {
  currentEmail: string;
  newEmail: string;
  createdAt: string;
}

export async function createEmailChangeToken(
  kv: KVNamespace,
  currentEmail: string,
  newEmail: string
): Promise<string> {
  const token = generateToken();
  const payload: EmailChangePayload = { currentEmail, newEmail, createdAt: new Date().toISOString() };
  await kv.put(EMAIL_CHANGE_KEY_PREFIX + token, JSON.stringify(payload), {
    expirationTtl: TOKEN_TTL_SECONDS,
  });
  return token;
}

/** Single-use: get then delete, same residual race caveat as consumeMagicLinkToken. */
export async function consumeEmailChangeToken(
  kv: KVNamespace,
  token: string
): Promise<{ currentEmail: string; newEmail: string } | null> {
  const key = EMAIL_CHANGE_KEY_PREFIX + token;
  const raw = await kv.get(key);
  if (!raw) return null;
  await kv.delete(key);
  try {
    const payload = JSON.parse(raw) as EmailChangePayload;
    return { currentEmail: payload.currentEmail, newEmail: payload.newEmail };
  } catch {
    return null;
  }
}
