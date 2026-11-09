import { parseResponse } from "hono/client";
import { client } from "@/lib/client";
import type { StreamableVideo, YouTubeVideo } from "@/lib/types";

// Reads throw on any non-2xx answer, so TanStack Query sees an error, as it
// did before (the old code failed while parsing the empty body).

export type Me = Awaited<ReturnType<typeof fetchAuthSession>>;
export type Config = Awaited<ReturnType<typeof fetchConfig>>;
export type Nominees = Awaited<ReturnType<typeof fetchNominees>>;
export type VoteResults = Awaited<ReturnType<typeof getVoteResults>>;

export async function fetchAuthSession() {
  return parseResponse(client.api.me.$get());
}

/** Config with the stored unix-second strings turned into numbers. */
export async function fetchConfig() {
  const config = await parseResponse(client.api.config.$get());
  const seconds = (s?: string) => (s === undefined ? undefined : Number(s));
  return {
    ...config,
    startTime: seconds(config.startTime),
    endTime: seconds(config.endTime),
  };
}

export async function fetchNominees() {
  const data = await parseResponse(client.api.nominees.$get());
  // In locked mode the server answers with the text "locked".
  if (typeof data === "string") {
    throw new Error("Nominees are locked");
  }
  return data;
}

export async function fetchUserVotes() {
  return parseResponse(client.api.vote.$get());
}

export async function getVoteResults() {
  return parseResponse(client.api.vote.results.$get());
}

/** Fire the vote. A refused vote (already voted, voting closed) is ignored, as before. */
export async function submitVote(categoryId: string, nomineeId: string) {
  await client.api.vote.$post({
    json: { category_id: categoryId, nominee_id: nomineeId },
  });
}

// Admin

export async function fetchAllUsers() {
  return parseResponse(client.api.admin.users.$get());
}

export async function fetchAdminNom() {
  return parseResponse(client.api.admin.nominees.$get());
}

/** One page of votes, 100 per page, page numbers from 0. */
export async function fetchAllVotes(
  page: number,
  filter: undefined | { uid?: number; ip?: string },
) {
  return parseResponse(
    client.api.admin.votes.$get({
      query: {
        page: page.toString(),
        filter_uid: filter?.uid?.toString(),
        filter_ip: filter?.ip || undefined,
      },
    }),
  );
}

export async function deleteCategory(id: string) {
  await client.api.admin.category.$delete({ query: { id } });
}

export async function deleteNominee(categoryId: string, id: string) {
  await client.api.admin.nominee.$delete({ query: { categoryId, id } });
}

export async function updateCategory(
  categoryId: string,
  description?: string,
  title?: string,
) {
  await client.api.admin.category.$patch({
    json: { id: categoryId, description, title },
  });
}

export type NomineePatch = Parameters<
  typeof client.api.admin.nominee.$patch
>[0]["json"];

export async function updateNominee(data: NomineePatch) {
  await client.api.admin.nominee.$patch({ json: data });
}

export async function makeAdmin(uid: number) {
  await client.api.admin.user.$patch({ json: uid });
}

// Third-party lookups, not our API.

export async function fetchStreamableData(shortcode?: string) {
  if (shortcode === undefined) {
    return null;
  }
  const response = await fetch(`https://api.streamable.com/videos/${shortcode}`);
  return (await response.json()) as StreamableVideo;
}

export async function fetchYouTubeEmbedData(videoId?: string) {
  if (!videoId) {
    return null;
  }

  const response = await fetch(
    `https://youtube.com/oembed?url=https://youtu.be/${videoId}`,
  );

  try {
    const json: YouTubeVideo = await response.json();
    return json;
  } catch (error) {
    return null;
  }
}
