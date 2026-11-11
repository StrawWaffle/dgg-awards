// The lab page's server side: its music track, the emote names, and the live
// chat summary for the presentation stage. Experimental; admins only, except
// the track (it plays for whoever opens the page).
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { getCookie } from "hono/cookie";
import { join } from "node:path";
import { verifyAdminSession } from "@/lib/auth";
import { isChatSource, relayFor } from "@/server/lab/chat-relay";
import { emoteCatalogue } from "@/server/lab/emotes";
import { SESSION_COOKIE } from "@/server/middleware";
import { serveFile } from "@/server/storage";

const { upgradeWebSocket, websocket } = createBunWebSocket();
/** For Bun.serve, which handles the socket once Hono has upgraded it. */
export { websocket };

const assets = join(import.meta.dir, "..", "..", "lab", "assets");

export const labRoutes = new Hono()
  // Byte ranges, so the browser can seek and loop it. AAC, and MP3 for
  // browsers without AAC.
  .get("/lab/:file{black-lover\\.(m4a|mp3)}", (c) =>
    serveFile(Bun.file(join(assets, c.req.param("file"))), c.req.header("Range") ?? null),
  )
  .get("/api/lab/emotes", async (c) => {
    if (!(await verifyAdminSession(getCookie(c, SESSION_COOKIE)))) return c.body(null, 401);
    return c.json([...((await emoteCatalogue())?.keys() ?? [])], 200);
  })
  .get(
    "/api/lab/chat",
    async (c, next) => {
      if (!(await verifyAdminSession(getCookie(c, SESSION_COOKIE)))) return c.body(null, 401);
      await next();
    },
    // `?source=`: omnichat (the default), gum (a test channel) or dgg.
    upgradeWebSocket((c) => {
      const asked = c.req.query("source");
      const source = isChatSource(asked) ? asked : "omnichat";
      let unsubscribe: (() => void) | null = null;
      return {
        onOpen(_event, ws) {
          unsubscribe = relayFor(source).subscribe((summary, status) => ws.send(JSON.stringify({ summary, status })));
        },
        onClose() {
          unsubscribe?.();
        },
      };
    }),
  );
