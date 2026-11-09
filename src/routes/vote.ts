import { verifyRequest } from "@/lib/auth";
import {
  getConfig,
  getUserVotes,
  getVotingResults,
  insertVote,
  userVoteExists,
} from "@/lib/data/driver";
import { nowS } from "@/lib/util";
import type { API, ApiVoteSubmit, Vote } from "@/lib/types";

export async function votePost(req: Bun.BunRequest<"/api/vote">) {
  const now = nowS();
  const session = await verifyRequest(req);
  if (!session) {
    return new Response(null, { status: 401 });
  }

  const config = await getConfig();
  if (!config.startTime || !config.endTime || !config.viewingMode) {
    return new Response(null, { status: 401 });
  }
  if (now < config.startTime || now > config.endTime) {
    return new Response(null, { status: 401 });
  }
  if (config.viewingMode !== "voting") {
    return new Response(null, { status: 401 });
  }

  const data: ApiVoteSubmit = await req.json();
  const { category_id, nominee_id } = data;
  if (!category_id || !nominee_id) {
    return new Response(null, { status: 400 });
  }
  if (await userVoteExists(session.uid, category_id)) {
    return new Response("You have already voted for this category.", {
      status: 400,
    });
  }

  const vote: Vote = {
    categoryId: category_id,
    optionId: nominee_id,
    at: new Date(),
    uid: session.uid,
    sessionSnapshot: session,
  };

  await insertVote(vote);
  return new Response(null);
}

export async function voteGet(req: Bun.BunRequest<"/api/vote">) {
  const session = await verifyRequest(req);
  if (!session) {
    return new Response(null, { status: 401 });
  }

  const votes = await getUserVotes(session.uid);
  return Response.json(votes satisfies API.Get_UserVotes);
}

export async function getAllVoteResults() {
  const config = await getConfig();
  if (!config) {
    return new Response(null, { status: 401 });
  }

  if (config.viewingMode !== "reviewing") {
    return new Response(null, { status: 401 });
  }

  const tally = await getVotingResults();
  if (tally === undefined) {
    return new Response(null, { status: 400 });
  }

  return Response.json(tally);
}
