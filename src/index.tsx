import { serve } from "bun";
import admin from "@/admin.html";
import site from "@/site.html";
import { createApp } from "@/server/app";
import { resumeClipJobs } from "@/server/clips";
import { startOffsiteBackups } from "@/server/backups";
import { websocket } from "@/server/routes/lab";

const app = createApp();

const server = serve({
  // Seconds a request may go quiet. Bun's default (10) cut off "Back up now",
  // which encrypts and uploads, and restores of large backups.
  idleTimeout: 120,
  // Bun bundles and serves the HTML pages; everything else is Hono.
  routes: {
    // The public site, one page (src/site/Site.tsx): the front page, voting,
    // this year's and last year's results, the lab (admins' experiments), and
    // the admins' previews.
    "/": site,
    "/vote": site,
    "/results": site,
    "/2025": site,
    "/chat": site,
    "/chat/all": site,
    "/lab": site,
    // Admins' previews of the site at each stage: /preview/<stage>/<page>.
    "/preview": site,
    "/preview/*": site,
    // Anyone can load the page; it checks for an admin itself, and every
    // /api/admin request is refused to anyone else.
    "/admin": admin,
  },
  fetch: app.fetch,
  websocket,

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`> ${server.url}`);

// Clip jobs interrupted by a restart start again.
resumeClipJobs().catch((error) => console.error("Resuming clip jobs failed:", error));
startOffsiteBackups();
