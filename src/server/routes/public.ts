import { Hono } from "hono";
import type chat2026 from "@/archive/chat-2026.json";
import { getChatReview } from "@/server/chat-review";
import { createMiddleware } from "hono/factory";
import {
  getCategoryForVoting,
  getConfig,
  getTimings,
  getNominees,
  getNominee,
  getUserBallots,
  getUserPlaces,
  getUserVotes,
  getVotingResults,
  getVoteTally,
  insertBallot,
  userVoteExists,
} from "@/lib/data/driver";
import { nowS } from "@/lib/util";
import { roundsOf, votableNow } from "@/lib/rounds";
import { isChatterAward } from "@/lib/dgger";
import { effectiveStyle, placesToRanks, validPlaces, withEffectiveStyles } from "@/lib/voting";
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
import { DGG_NAME, cachedDggProfile, chatterName } from "@/server/dgg-profile";

/**
 * 401 with no body unless voting is open right now: the site's dates, or a
 * round's (src/lib/rounds.ts). Which award is open is checked with the ballot.
 */
const requireVotingOpen = createMiddleware(async (c, next) => {
  const now = nowS();
  const config = await getConfig();
  if (config.viewingMode !== "voting") return c.body(null, 401);
  if (votableNow(await getTimings(), config, now).length === 0) return c.body(null, 401);
  await next();
});

export const publicRoutes = new Hono<SessionEnv>()
  // The settings, and the rounds' dates when there are rounds (src/lib/rounds.ts).
  .get("/api/config", async (c) => {
    const rounds = roundsOf(await getTimings());
    return c.json({ ...(await getConfig()), ...(rounds.length ? { rounds } : {}) }, 200);
  })

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

  /** The same, as places: groups of equals, best first (for points ballots, which can tie). */
  .get("/api/vote/places", requireSession, async (c) =>
    c.json(await getUserPlaces(c.get("session").uid), 200),
  )

  // The destiny.gg profile of a nominee in a points award or one of DGGer's
  // awards (the vote shows each chatter's card). Only those nominees, so it
  // isn't an open proxy to destiny.gg, and only when the nominees are public. Cached.
  .get("/api/nominees/:category/:id/profile", async (c) => {
    const config = await getConfig();
    if (config.viewingMode === "locked") return c.body(null, 401);
    const category = await getCategoryForVoting(c.req.param("category"));
    if (!category || (effectiveStyle(category.votingStyle, config.defaultVotingStyle) !== "points" && !isChatterAward(category.id))) {
      return c.body(null, 404);
    }
    const nominee = await getNominee(category.id, c.req.param("id"));
    const name = nominee && chatterName(nominee.title);
    if (!name || !DGG_NAME.test(name)) return c.body(null, 404);
    try {
      const profile = await cachedDggProfile(name);
      // Kept by the browser for an hour, so coming back to the vote is instant.
      if (profile) c.header("Cache-Control", "public, max-age=3600");
      return profile ? c.json(profile, 200) : c.body(null, 404);
    } catch (error) {
      console.error(error);
      return c.body(null, 502);
    }
  })

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
      const config = await getConfig();
      // This award must be open now: during a round, only that round's awards are.
      const open = votableNow(await getTimings(), config, nowS());
      if (!open.some((a) => a.id === category.id)) {
        return c.text("Voting on this award isn't open right now.", 403);
      }
      const style = effectiveStyle(category.votingStyle, config.defaultVotingStyle);

      // The ballot must match the category's style and name its nominees,
      // each once. A points ballot is a top 10 at most, equals sharing a place.
      const rows =
        "places" in body
          ? placesToRanks(body.places)
          : ("ranking" in body ? body.ranking : [body.nominee_id]).map((id, i) => ({ id, rank: i + 1 }));
      const shape = "places" in body ? "points" : "ranking" in body ? "ranked" : "single";
      const nominees = new Set(category.options.map((o) => o.id));
      if (
        style !== shape ||
        ("places" in body && !validPlaces(body.places)) ||
        new Set(rows.map((r) => r.id)).size !== rows.length ||
        (category.rankLimit != null && "ranking" in body && rows.length > category.rankLimit) ||
        !rows.every((r) => nominees.has(r.id))
      ) {
        return c.body(null, 400);
      }

      if (await userVoteExists(session.uid, body.category_id)) {
        return c.text("You have already voted for this category.", 400);
      }
      await insertBallot(session, body.category_id, style, rows);
      return c.body(null, 200);
    },
  )

  // The year in DGG chat (src/server/chat-review.ts): public with the
  // results, and for admins with ?preview=1. Served from here rather than
  // bundled into the page, so it stays out of sight until then.
  .get("/api/chat-review", zValidator("query", resultsQuery, rejectInvalid), async (c) => {
    const config = await getConfig();
    const preview =
      c.req.valid("query").preview === "1" &&
      (await verifyAdminSession(getCookie(c, SESSION_COOKIE))) !== null;
    if (config.viewingMode !== "reviewing" && !preview) return c.body(null, 401);
    const review = await getChatReview("2026");
    if (!review) return c.body(null, 404);
    return c.json(review as typeof chat2026, 200);
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
