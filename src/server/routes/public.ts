import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import {
  getConfig,
  getNominees,
  getUserVotes,
  getVotingResults,
  insertVote,
  userVoteExists,
} from "@/lib/data/driver";
import { nowS } from "@/lib/util";
import {
  type SessionEnv,
  rejectInvalid,
  requireSession,
  zValidator,
} from "@/server/middleware";
import { voteSubmit } from "@/server/schemas";

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
    return c.json(await getNominees(), 200);
  })

  .get("/api/vote", requireSession, async (c) =>
    c.json(await getUserVotes(c.get("session").uid), 200),
  )

  // Checks run in the old order: signed in, voting open, then the body.
  .post(
    "/api/vote",
    requireSession,
    requireVotingOpen,
    zValidator("json", voteSubmit, rejectInvalid),
    async (c) => {
      const session = c.get("session");
      const { category_id, nominee_id } = c.req.valid("json");
      if (await userVoteExists(session.uid, category_id)) {
        return c.text("You have already voted for this category.", 400);
      }
      await insertVote({
        categoryId: category_id,
        optionId: nominee_id,
        at: new Date(),
        uid: session.uid,
        sessionSnapshot: session,
      });
      return c.body(null, 200);
    },
  )

  .get("/api/vote/results", async (c) => {
    const config = await getConfig();
    if (config.viewingMode !== "reviewing") {
      return c.body(null, 401);
    }
    return c.json(await getVotingResults(), 200);
  });
