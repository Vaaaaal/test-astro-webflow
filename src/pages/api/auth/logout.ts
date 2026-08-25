import type { APIRoute } from "astro";

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

export const POST: APIRoute = async ({ session, redirect }) => {
  session?.destroy();
  return redirect(`${BASE}/login`);
};
