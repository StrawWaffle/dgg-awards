import { serve } from "bun";
import admin from "@/admin.html";
import home from "@/home.html";
import index from "@/index.html";
import lab from "@/lab.html";
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
    // The front page (a countdown to voting) and last year's results.
    "/": home,
    "/2025": home,
    // The voting and results page, until the lab's voting page replaces it.
    "/vote": index,
    // Anyone can load the page; it checks for an admin itself, and every
    // /api/admin request is refused to anyone else.
    "/admin": admin,
    // Experimental; the page itself checks for an admin.
    "/lab": lab,
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
