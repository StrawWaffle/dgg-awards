import type {
  API,
  ResultsData,
  StreamableVideo,
  YouTubeVideo,
} from "@/lib/types";

function partialParamsConstructor(params: Record<string, string | undefined>) {
  const _ = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val) {
      _.set(key, val);
    }
  });
  return _;
}

async function fjson<T>(k: string): Promise<T> {
  return await (await fetch(k)).json();
}

export async function fetchAuthSession() {
  return fjson<API.GET_Me>("/api/me");
}

export async function fetchConfig() {
  return fjson<API.GET_Config>("/api/config");
}

export async function fetchNominees() {
  return fjson<API.GET_Nominees>("/api/nominees");
}

export async function fetchUserVotes() {
  return fjson<API.Get_UserVotes>("/api/vote");
}

export async function fetchStreamableData(shortcode?: string) {
  if (shortcode === undefined) {
    return null;
  }

  return fjson<StreamableVideo>(
    `https://api.streamable.com/videos/${shortcode}`,
  );
}

export async function fetchAllUsers() {
  return fjson<API.GET_AllUsers>("/api/admin/users");
}

export async function fetchAdminNom() {
  return fjson<API.GET_Nominees>("/api/admin/nominees");
}

export async function fetchAllVotes(
  offset: number,
  filter: undefined | { uid?: number; ip?: string },
) {
  return fjson<API.GET_AllVotes>(
    `/api/admin/votes?${partialParamsConstructor({ offset: offset.toString(), filter_uid: filter?.uid?.toString(), filter_ip: filter?.ip }).toString()}`,
  );
}

export async function deleteCategory(id: string) {
  await fetch(`/api/admin/category?id=${encodeURIComponent(id)}`, {
    method: "delete",
  });
}

export async function deleteNominee(categoryId: string, id: string) {
  await fetch(
    `/api/admin/nominee?${new URLSearchParams({ categoryId, id }).toString()}`,
    { method: "delete" },
  );
}

export async function updateCategory(
  categoryId: string,
  description?: string,
  title?: string,
) {
  await fetch(`/api/admin/category`, {
    method: "PATCH",
    headers: [["Content-Type", "application/json"]],
    body: JSON.stringify({
      id: categoryId,
      description,
      title,
    } satisfies API.PATCH_CategoryRequest),
  });
}

export async function updateNominee(data: API.PATCH_NomineeRequest) {
  await fetch("/api/admin/nominee", {
    method: "PATCH",
    headers: [["Content-Type", "application/json"]],
    body: JSON.stringify(data),
  });
}

export async function makeAdmin(data: API.PATCH_AdminUserRequest) {
  await fetch("/api/admin/user", {
    method: "PATCH",
    headers: [["Content-Type", "application/json"]],
    body: JSON.stringify(data),
  });
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

export async function submitVote(categoryId: string, nomineeId: string) {
  fetch("/api/vote", {
    body: JSON.stringify({
      category_id: categoryId,
      nominee_id: nomineeId,
    }),
    method: "POST",
    headers: [["Content-Type", "application/json"]],
  });
}

export async function getVoteResults() {
  return fjson<ResultsData>("/api/vote/results");
}
