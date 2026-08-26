import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { consumeEmailChangeToken } from "../../../lib/authTokens";
import { readUsersDoc, writeUsersDoc, findUser } from "../../../lib/usersStore";
import { readProfilesDoc, writeProfilesDoc, findProfile } from "../../../lib/profilesStore";

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

// Not session-gated (not under /api/account) — the link is opened from the
// NEW address's inbox, possibly on a different device with no active
// session at all. The token itself is the proof, same as /api/auth/verify.
export const GET: APIRoute = async ({ request, session, redirect }) => {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return redirect(`${BASE}/admin/account?error=missing_token`);
  }

  const payload = await consumeEmailChangeToken(env.AUTH_TOKENS, token);
  if (!payload) {
    return redirect(`${BASE}/admin/account?error=invalid_or_expired_token`);
  }
  const { currentEmail, newEmail } = payload;

  // Re-check both sides at confirm time, not just at request time — the
  // account may have been deleted, or the new address claimed by someone
  // else, in the window between request and click.
  const { doc: usersDoc } = await readUsersDoc(env.PAGES_BUCKET);
  const currentEntry = findUser(usersDoc, currentEmail);
  if (!currentEntry) {
    return redirect(`${BASE}/admin/account?error=account_not_found`);
  }
  if (findUser(usersDoc, newEmail)) {
    return redirect(`${BASE}/admin/account?error=email_taken`);
  }

  await writeUsersDoc(env.PAGES_BUCKET, (doc) => {
    const entry = doc.users.find((u) => u.email === currentEmail);
    if (entry) entry.email = newEmail;
    return doc;
  });

  const { doc: profilesDoc } = await readProfilesDoc(env.PAGES_BUCKET);
  const profile = findProfile(profilesDoc, currentEmail);
  if (profile) {
    await writeProfilesDoc(env.PAGES_BUCKET, (doc) => {
      const entry = doc.profiles.find((p) => p.email === currentEmail);
      if (entry) entry.email = newEmail;
      return doc;
    });

    if (profile.hasAvatar) {
      const oldKey = `avatars/${currentEmail}`;
      const newKey = `avatars/${newEmail}`;
      const obj = await env.PAGES_BUCKET.get(oldKey);
      if (obj) {
        await env.PAGES_BUCKET.put(newKey, obj.body, {
          httpMetadata: obj.httpMetadata,
        });
        await env.PAGES_BUCKET.delete(oldKey);
      }
    }
  }

  await session?.regenerate(); // rotate session ID, prevents session fixation
  session?.set("userEmail", newEmail);

  return redirect(`${BASE}/admin/account?emailChanged=1`);
};
