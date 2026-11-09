import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import {
  getCategoryForVoting,
  getConfig,
  getNominees,
  getUserBallots,
  getUserVotes,
  getVotingResults,
  getVoteTally,
  insertBallot,
  userVoteExists,
} from "@/lib/data/driver";
import { nowS } from "@/lib/util";
import { effectiveStyle, withEffectiveStyles } from "@/lib/voting";
import { categoriesWithMediaUrls, withMediaUrls } from "@/server/present";
import { getCookie } from "hono/cookie";
import { verifyAdminSession } from "@/lib/auth";
import {
  SESSION_COOKIE,
  type SessionEnv,
  rejectInvalid,
  requireSession,
  zValidator,
} from "@/server/middleware";
import { resultsQuery, voteSubmit } from "@/server/schemas";
import chatReview from "@/archive/chat-2026.json";

/** 401 with no body unless voting is open right now. */
const requireVotingOpen = createMiddleware(async (c, next) => {
  const now = nowS();
  const config = await getConfig();
  if (!config.startTime || !config.endTime || !config.viewingMode) {
    return c.body(null, 401);
  }
  // Stored as strings; compared as numbers, as before.
  if (now < Number(config.startTime) || now > Number(config.endTime)) {
    return c.body(null, 401);
  }
  if (config.viewingMode !== "voting") {
    return c.body(null, 401);
  }
  await next();
});

export const publicRoutes = new Hono<SessionEnv>()
  .get("/api/config", async (c) => c.json(await getConfig(), 200))

  .get("/api/nominees", async (c) => {
    const config = await getConfig();
    if (config.viewingMode === "locked") {
      return c.text("locked", 200);
    }
    return c.json(categoriesWithMediaUrls(withEffectiveStyles(await getNominees(), config.defaultVotingStyle)), 200);
  })

  /** First choice per category. */
  .get("/api/vote", requireSession, async (c) =>
    c.json(await getUserVotes(c.get("session").uid), 200),
  )

  /** Whole ballot per category, best choice first. */
  .get("/api/vote/ballots", requireSession, async (c) =>
    c.json(await getUserBallots(c.get("session").uid), 200),
  )

  // Checks run in the old order: signed in, voting open, then the body.
  .post(
    "/api/vote",
    requireSession,
    requireVotingOpen,
    zValidator("json", voteSubmit, rejectInvalid),
    async (c) => {
      const session = c.get("session");
      const body = c.req.valid("json");
      const category = await getCategoryForVoting(body.category_id);
      if (!category) {
        return c.body(null, 400);
      }
      const style = effectiveStyle(category.votingStyle, (await getConfig()).defaultVotingStyle);

      // The ballot must match the category's style and name its nominees,
      // each once.
      const choices = "ranking" in body ? body.ranking : [body.nominee_id];
      const nominees = new Set(category.options.map((o) => o.id));
      if (
        (style === "single") !== ("nominee_id" in body) ||
        new Set(choices).size !== choices.length ||
        !choices.every((id) => nominees.has(id))
      ) {
        return c.body(null, 400);
      }

      if (await userVoteExists(session.uid, body.category_id)) {
        return c.text("You have already voted for this category.", 400);
      }
      await insertBallot(session, body.category_id, style, choices);
      return c.body(null, 200);
    },
  )

  // The year in DGG chat (src/archive/chat-2026.json): public with the
  // results, and for admins with ?preview=1. Served from here rather than
  // bundled into the page, so it stays out of sight until then.
  .get("/api/chat-review", zValidator("query", resultsQuery, rejectInvalid), async (c) => {
    const config = await getConfig();
    const preview =
      c.req.valid("query").preview === "1" &&
      (await verifyAdminSession(getCookie(c, SESSION_COOKIE))) !== null;
    if (config.viewingMode !== "reviewing" && !preview) return c.body(null, 401);
    return c.json(chatReview, 200);
  })

  // The tally (voters, ballots, per day): public with the results, and for
  // admins with ?preview=1.
  .get("/api/vote/tally", zValidator("query", resultsQuery, rejectInvalid), async (c) => {
    const config = await getConfig();
    const preview =
      c.req.valid("query").preview === "1" &&
      (await verifyAdminSession(getCookie(c, SESSION_COOKIE))) !== null;
    if (config.viewingMode !== "reviewing" && !preview) return c.body(null, 401);
    return c.json(await getVoteTally(), 200);
  })

  // Results are public once the site is in reviewing mode. Admins can see
  // them any time with ?preview=1, to check the reveal before the stream.
  .get("/api/vote/results", zValidator("query", resultsQuery, rejectInvalid), async (c) => {
    const config = await getConfig();
    const preview =
      c.req.valid("query").preview === "1" &&
      (await verifyAdminSession(getCookie(c, SESSION_COOKIE))) !== null;
    if (config.viewingMode !== "reviewing" && !preview) {
      return c.body(null, 401);
    }
    return c.json(
      (await getVotingResults()).map((cat) => ({
        ...cat,
        options: cat.options.map((o) => ({ ...o, payload: withMediaUrls(o.payload) })),
      })),
      200,
    );
  });
