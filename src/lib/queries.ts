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

/** `preview`: admins can see results in any mode (the server checks). */
export async function getVoteResults(preview = false) {
  return parseResponse(
    client.api.vote.results.$get({ query: preview ? { preview: "1" } : {} }),
  );
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

// Editor calls: unlike the fire-and-forget helpers above, these throw an
// Error carrying the server's message, so the form can show what went wrong.

export type AdminCategory = Awaited<ReturnType<typeof fetchAdminNom>>[number];
export type AdminNominee = AdminCategory["options"][number];
export type Issue = Awaited<ReturnType<typeof fetchChecks>>[number];
export type DggProfile = Awaited<ReturnType<typeof fetchDggProfile>>;

async function ok(
  res: { ok: boolean; status: number; text(): Promise<string> },
  fallback: string,
) {
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  throw new Error(text || `${fallback} (${res.status})`);
}

export type CategoryCreate = Parameters<typeof client.api.admin.categories.$post>[0]["json"];

/** Returns the new category's id. */
export async function createCategory(data: CategoryCreate) {
  const res = await client.api.admin.categories.$post({ json: data });
  await ok(res, "Couldn't add the category");
  return (await res.json()) as { id: string };
}

export type NomineeCreate = Parameters<typeof client.api.admin.nominees.$post>[0]["json"];

/** Returns the new nominee's id. */
export async function createNominee(data: NomineeCreate) {
  const res = await client.api.admin.nominees.$post({ json: data });
  await ok(res, "Couldn't add the nominee");
  return (await res.json()) as { id: string; categoryId: string };
}

export async function fetchChecks() {
  return parseResponse(client.api.admin.checks.$get());
}

export async function saveNominee(data: NomineePatch) {
  await ok(await client.api.admin.nominee.$patch({ json: data }), "Couldn't save the nominee");
}

export type CategoryPatch = Parameters<typeof client.api.admin.category.$patch>[0]["json"];

export async function saveCategory(data: CategoryPatch) {
  await ok(await client.api.admin.category.$patch({ json: data }), "Couldn't save the category");
}

export type SettingsPatch = Parameters<typeof client.api.admin.settings.$patch>[0]["json"];

export async function saveSettings(data: SettingsPatch) {
  const res = await client.api.admin.settings.$patch({ json: data });
  await ok(res, "Couldn't save the settings");
}

export async function buildClip(categoryId: string, id: string) {
  await ok(await client.api.admin.clip.$post({ json: { categoryId, id } }), "Couldn't start the clip");
}

export async function pickThumbnail(categoryId: string, id: string, at: number) {
  await ok(
    await client.api.admin.thumbnail.$post({ json: { categoryId, id, at } }),
    "Couldn't take that frame",
  );
}

export async function uploadThumbnail(categoryId: string, id: string, file: File) {
  await ok(
    await client.api.admin.thumbnail.upload.$post({ form: { categoryId, id, file } }),
    "Couldn't use that image",
  );
}

/** A destiny.gg membership card; null if there's no such user. */
export async function fetchDggProfile(name: string) {
  const res = await client.api.admin["dgg-profile"][":name"].$get({ param: { name } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Couldn't load the profile (${res.status})`);
  return parseResponse(Promise.resolve(res));
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
