import { parseResponse } from "hono/client";
import { client } from "@/lib/client";
import type { HistoryKind } from "@/lib/data/schema";
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

/** The admins, or with `q` up to 20 users whose name contains it. */
export async function fetchUsers(q?: string) {
  return parseResponse(client.api.admin.users.$get({ query: q ? { q } : {} }));
}

export type AdminUser = Awaited<ReturnType<typeof fetchUsers>>[number];

export async function fetchAdminNom() {
  return parseResponse(client.api.admin.nominees.$get());
}

export type VoteFilter = { uid?: number; ip?: string; name?: string };

/** One page of votes, 100 per page, page numbers from 0. */
export async function fetchAllVotes(page: number, filter: VoteFilter = {}) {
  return parseResponse(
    client.api.admin.votes.$get({
      query: {
        page: page.toString(),
        filter_uid: filter.uid?.toString(),
        filter_ip: filter.ip || undefined,
        filter_name: filter.name || undefined,
      },
    }),
  );
}

export async function fetchVoteStats() {
  return parseResponse(client.api.admin.stats.$get());
}

export async function deleteCategory(id: string) {
  await ok(await client.api.admin.category.$delete({ query: { id } }), "Couldn't delete the category");
}

export async function deleteNominee(categoryId: string, id: string) {
  await ok(await client.api.admin.nominee.$delete({ query: { categoryId, id } }), "Couldn't delete the nominee");
}

/** Add categories from an export file. Returns how many. */
export async function importNominees(text: string) {
  const res = await client.api.admin.import.$post({ form: { data: text } }, { init: { redirect: "manual" } });
  // Success answers with a redirect back to the admin page (it's a form post too).
  if (res.status === 400) throw new Error("That file isn't in the export format.");
  if (res.type !== "opaqueredirect" && res.status !== 302) await ok(res, "Couldn't import");
}

export type NomineePatch = Parameters<
  typeof client.api.admin.nominee.$patch
>[0]["json"];

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

export async function saveCategoryOrder(ids: string[]) {
  await ok(await client.api.admin.categories.order.$put({ json: { ids } }), "Couldn't save the order");
}

export async function saveNomineeOrder(categoryId: string, ids: string[]) {
  await ok(await client.api.admin.nominees.order.$put({ json: { categoryId, ids } }), "Couldn't save the order");
}

export type HistoryFilter = { kind?: HistoryKind; categoryId?: string; nomineeId?: string };
export type HistoryEntry = Awaited<ReturnType<typeof fetchHistory>>[number];

/** Edit history, newest first, 50 a page. */
export async function fetchHistory(page = 0, filter: HistoryFilter = {}) {
  return parseResponse(
    client.api.admin.history.$get({
      query: {
        page: String(page),
        ...(filter.kind ? { kind: filter.kind } : {}),
        ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
        ...(filter.nomineeId ? { nomineeId: filter.nomineeId } : {}),
      },
    }),
  );
}

/** Undo refused; `fields` lists what was edited again since, if that's why. */
export class UndoRefused extends Error {
  constructor(
    message: string,
    readonly fields: string[],
  ) {
    super(message);
  }
}

export async function undoHistory(id: number, force = false) {
  const res = await client.api.admin.history[":id"].undo.$post({ param: { id: String(id) }, json: { force } });
  if (res.status === 409) {
    const body = (await res.json()) as { message: string; fields: string[] };
    throw new UndoRefused(body.message, body.fields);
  }
  await ok(res, "Couldn't undo that");
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

/** The video library on the server. */
export async function fetchLibrary() {
  return parseResponse(client.api.admin.library.$get());
}
export type LibraryItem = Awaited<ReturnType<typeof fetchLibrary>>[number];

export async function clipFromLibrary(categoryId: string, id: string, path: string, start: number | null, end: number | null) {
  await ok(
    await client.api.admin.clip.library.$post({ json: { categoryId, id, path, start, end } }),
    "Couldn't make the clip",
  );
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

export async function removeThumbnail(categoryId: string, id: string) {
  await ok(await client.api.admin.thumbnail.$delete({ query: { categoryId, id } }), "Couldn't remove the picture");
}

/** A destiny.gg membership card; null if there's no such user. */
export async function fetchDggProfile(name: string) {
  const res = await client.api.admin["dgg-profile"][":name"].$get({ param: { name } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Couldn't load the profile (${res.status})`);
  return parseResponse(Promise.resolve(res));
}

export async function setAdmin(uid: number, admin: boolean) {
  await ok(await client.api.admin.user.$patch({ json: { uid, admin } }), "Couldn't change that");
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
