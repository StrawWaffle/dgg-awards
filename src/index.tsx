import { serve } from "bun";
import { renderToReadableStream } from "react-dom/server";
import {
  addCategory,
  addNominee,
  nomineesGet as adminNomGet,
  deleteCategory,
  deleteNominee,
  getUsers,
  getVotes,
  importStaticData,
  makeAdmin,
  setConfig,
  updateCategory,
  updateNominee,
} from "@/routes/admin";
import { getConfig } from "@/routes/config";
import { me } from "@/routes/me";
import { nomineesGet } from "@/routes/nominees";
import { oauth } from "@/routes/oauth";
import { signin } from "@/routes/signin";
import { signout } from "@/routes/signout";
import { getAllVoteResults, voteGet, votePost } from "@/routes/vote";
import admin from "@/admin.html";
import index from "@/index.html";
import { verifyAdminRequest } from "@/lib/auth";
import { env } from "@/lib/util";

const nonce = crypto.getRandomValues(new Uint8Array(64)).toHex();

const mediaUrl = env("MEDIA_URL", "https://cdn.dgg.events/");

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
const server = serve({
  //@ts-ignore
  routes: {
    "/": index,
    "/robots.txt": () =>
      new Response(robotsTxt, {
        headers: [
          ["Content-Type", "text/plain; charset=utf-8"],
          ["X-Robots-Tag", noIndex],
        ],
      }),
    "/admin": async (req) => {
      const session = await verifyAdminRequest(req);
      if (!session) {
        return new Response(null, { status: 401 });
      }

      return new Response(null, {
        status: 302,
        headers: [["Location", `/admin/${nonce}`]],
      });
    },
    [`/admin/${nonce}`]: admin,
    "/signin": {
      GET: signin,
    },
    "/signout": {
      POST: signout,
    },
    "/oauth": {
      GET: oauth,
    },
    "/api/nominees": nomineesGet,
    "/api/admin/category": {
      POST: addCategory,
      DELETE: deleteCategory,
      PATCH: updateCategory,
    },
    "/api/admin/nominee": {
      POST: addNominee,
      DELETE: deleteNominee,
      PATCH: updateNominee,
    },
    "/api/admin/votes": {
      GET: getVotes,
    },
    "/api/admin/config": {
      POST: setConfig,
    },
    "/api/admin/import": {
      POST: importStaticData,
    },
    "/api/admin/users": {
      GET: getUsers,
    },
    "/api/admin/nominees": {
      GET: adminNomGet,
    },
    "/api/admin/user": {
      PATCH: makeAdmin,
    },
    "/api/me": me,
    "/api/config": getConfig,
    "/api/vote": {
      GET: voteGet,
      POST: votePost,
    },
    "/api/vote/results": {
      GET: getAllVoteResults,
    },
    "/error": async (req) => {
      const text = atob(new URL(req.url).searchParams.get("error") ?? "");

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
        {
          headers: [["Content-Type", "text/html"]],
        },
      );
    },
    "/Media/:id": async ({ params }) => {
      // Serve from src/media first; the old CDN (cdn.dgg.events) is gone.
      const name = decodeURIComponent(params.id);
      if (/^[\w.-]+$/.test(name) && !name.startsWith(".")) {
        const file = Bun.file(`${import.meta.dir}/media/${name}`);
        if (await file.exists()) {
          return new Response(file, {
            headers: [
              ["Cache-Control", "public, max-age=3600"],
              ["X-Robots-Tag", noIndex],
            ],
          });
        }
      }
      return Response.redirect(`${mediaUrl}${params.id}`, 302);
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`> ${server.url}`);
