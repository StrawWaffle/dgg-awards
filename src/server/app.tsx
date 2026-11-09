import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { join } from "node:path";
import { renderToReadableStream } from "react-dom/server";
import { verifyAdminSession } from "@/lib/auth";
import { env } from "@/lib/util";
import { SESSION_COOKIE } from "@/server/middleware";
import { adminRoutes } from "@/server/routes/admin";
import { authRoutes } from "@/server/routes/auth";
import { labRoutes } from "@/server/routes/lab";
import { publicRoutes } from "@/server/routes/public";
import { MEDIA_KEY, serveFile, storage } from "@/server/storage";

const mediaUrl = env("MEDIA_URL", "https://cdn.dgg.events/");
const mediaDir = join(import.meta.dir, "..", "media");

const noIndex = "noindex, nofollow, noarchive, nosnippet, noimageindex, noai, noimageai";
// Disallow everyone, and name the AI crawlers too, since some only obey
// rules addressed to them.
const aiCrawlers = [
  "GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-User",
  "Claude-SearchBot", "anthropic-ai", "Google-Extended", "GoogleOther",
  "Applebot-Extended", "CCBot", "PerplexityBot", "Perplexity-User",
  "Bytespider", "Amazonbot", "meta-externalagent", "FacebookBot",
  "cohere-ai", "Diffbot", "ImagesiftBot", "Omgilibot", "Timpibot",
  "YouBot", "MistralAI-User", "DuckAssistBot",
];
const robotsTxt = [
  ...aiCrawlers.map((bot) => `User-agent: ${bot}\nDisallow: /\n`),
  "User-agent: *\nDisallow: /\n",
].join("\n");

/**
 * Everything except the two HTML pages, which Bun serves from its bundler
 * (see src/index.tsx). `adminPath` is where the admin page is mounted.
 */
export function createApp(adminPath: string) {
  return new Hono()
    .route("/", authRoutes)
    .route("/", publicRoutes)
    .route("/api/admin", adminRoutes)
    .route("/", labRoutes)

    .get("/admin", async (c) => {
      const session = await verifyAdminSession(getCookie(c, SESSION_COOKIE));
      if (!session) {
        return c.body(null, 401);
      }
      return c.redirect(adminPath, 302);
    })

    // Clips and thumbnails when they're stored locally (not on R2).
    .get("/files/*", async (c) => {
      const key = decodeURIComponent(c.req.path.slice("/files/".length));
      const file = MEDIA_KEY.test(key) ? storage.localFile?.(key) : null;
      if (!file) return c.body(null, 404);
      return serveFile(file, c.req.header("Range") ?? null);
    })

    .get("/robots.txt", (c) => {
      c.header("X-Robots-Tag", noIndex);
      return c.text(robotsTxt, 200);
    })

    .get("/Media/:id", async (c) => {
      const id = c.req.param("id");
      // Serve from src/media first; the old CDN (cdn.dgg.events) is gone.
      const name = decodeURIComponent(id);
      if (/^[\w.-]+$/.test(name) && !name.startsWith(".")) {
        const file = Bun.file(join(mediaDir, name));
        if (await file.exists()) {
          return new Response(file, {
            headers: [
              ["Cache-Control", "public, max-age=3600"],
              ["X-Robots-Tag", noIndex],
            ],
          });
        }
      }
      return c.redirect(`${mediaUrl}${id}`, 302);
    })

    .get("/error", async (c) => {
      const text = atob(c.req.query("error") ?? "");
      return new Response(
        await renderToReadableStream(
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              maxWidth: "24rem",
              marginInline: "auto",
              transform: "scale(175%)",
              height: "60%",
            }}
          >
            <img
              style={{ width: "2rem", height: "2rem" }}
              src="/Media/temmieDank.png"
            />
            <p style={{ fontWeight: "bolder", margin: 0, padding: 0 }}>
              Sorry, an error occured! This message may help you find out why:
            </p>
            <p
              style={{
                marginLeft: "0.5rem",
                color: "red",
                alignSelf: "start",
                marginRight: 0,
                marginBlock: 0,
                padding: 0,
              }}
            >
              {text === "" ? "Internal Error" : text}
            </p>
            <a href="/" style={{ color: "blue" }}>
              Go home
            </a>
          </div>,
        ),
        { headers: [["Content-Type", "text/html"]] },
      );
    });
}

export type AppType = ReturnType<typeof createApp>;
