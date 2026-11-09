import { serve } from "bun";
import admin from "@/admin.html";
import index from "@/index.html";
import { createApp } from "@/server/app";
import { resumeClipJobs } from "@/server/clips";

// The admin page lives at an unguessable path; /admin redirects admins there.
const adminPath = `/admin/${crypto.getRandomValues(new Uint8Array(64)).toHex()}`;
const app = createApp(adminPath);

const server = serve({
  // Bun bundles and serves the two HTML pages; everything else is Hono.
  routes: {
    "/": index,
    [adminPath]: admin,
  },
  fetch: app.fetch,

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`> ${server.url}`);

// Clip jobs interrupted by a restart start again.
resumeClipJobs().catch((error) => console.error("Resuming clip jobs failed:", error));
