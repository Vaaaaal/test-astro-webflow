import { defineConfig } from "astro/config";

import cloudflare from "@astrojs/cloudflare";

import react from '@astrojs/react';

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export default defineConfig({
  base: "CLOUD_MOUNT_PATH",
  output: "server",
  compressHTML: true,
  adapter: cloudflare(),

  // No maxAge/ttl by default means a browser-session cookie (dies when the
  // browser fully closes, not just the tab) backed by a KV value that never
  // expires on its own — every browser restart forced a fresh magic-link
  // email. Give both a real lifetime so login persists across restarts.
  session: {
    cookie: { maxAge: SESSION_MAX_AGE_SECONDS },
    ttl: SESSION_MAX_AGE_SECONDS,
  },

  integrations: [react()],
  vite: {
    resolve: {
      // Use react-dom/server.edge instead of react-dom/server.browser for React 19.
      // Without this, MessageChannel from node:worker_threads needs to be polyfilled.
      alias: import.meta.env.PROD ? {
        "react-dom/server": "react-dom/server.edge",
      } : undefined,
    },

    plugins: [tailwindcss()]
  }
});