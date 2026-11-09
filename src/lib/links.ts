// What a nominee's link points at, and how to point at the right moment.
// Pure functions shared by the server and the browser.

export const linkTypes = [
  "youtube-video",
  "youtube-clip",
  "youtube-channel",
  "twitch-vod",
  "twitch-clip",
  "twitch-channel",
  "kick-vod",
  "kick-clip",
  "kick-channel",
  "streamable",
  "reddit-post",
  "reddit-subreddit",
  "reddit-user",
  "x-post",
  "x-profile",
  "dgg-profile",
  "image",
  "video-file",
  "wiki",
  "web",
] as const;

export type LinkType = (typeof linkTypes)[number];

/**
 * Links to a whole channel, profile or subreddit instead of the moment
 * itself. The most common complaint on the 2025 stream. A destiny.gg profile
 * is not on this list: for chatter nominees, the membership card (bio,
 * signature, member since) is the thing being nominated.
 */
export const bareLinkTypes: ReadonlySet<LinkType> = new Set([
  "youtube-channel",
  "twitch-channel",
  "kick-channel",
  "reddit-subreddit",
  "reddit-user",
  "x-profile",
]);

/** Long recordings, where a link without a timestamp drops you at 0:00. */
export const longVideoTypes: ReadonlySet<LinkType> = new Set([
  "youtube-video",
  "twitch-vod",
  "kick-vod",
]);

/** Links a clip can be cut from (yt-dlp handles all of these). */
export const videoLinkTypes: ReadonlySet<LinkType> = new Set([
  "youtube-video",
  "youtube-clip",
  "twitch-vod",
  "twitch-clip",
  "kick-vod",
  "kick-clip",
  "streamable",
  "x-post",
  "reddit-post",
  "video-file",
]);

/** "1h2m3s", "2m3s", "123s", "123" or "1:02:03" to seconds. */
export function parseTimestamp(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v);
  const hms = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (hms && (hms[1] || hms[2] || hms[3])) {
    return Number(hms[1] ?? 0) * 3600 + Number(hms[2] ?? 0) * 60 + Number(hms[3] ?? 0);
  }
  const colon = v.match(/^(?:(\d+):)?(\d+):(\d{2})$/);
  if (colon) {
    return Number(colon[1] ?? 0) * 3600 + Number(colon[2]) * 60 + Number(colon[3]);
  }
  return undefined;
}

/** Seconds as "1:02:03" or "2:03". */
export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function hostOf(url: URL) {
  return url.hostname.replace(/^(www|m|old|mobile)\./, "");
}

/** The link's type, and the timestamp it already carries, if any. */
export function classifyLink(raw: string): { type: LinkType; start?: number } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { type: "web" };
  }
  const host = hostOf(url);
  const parts = url.pathname.split("/").filter(Boolean);
  const t =
    parseTimestamp(url.searchParams.get("t")) ??
    parseTimestamp(url.searchParams.get("start")) ??
    parseTimestamp(new URLSearchParams(url.hash.slice(1)).get("t"));
  const withStart = (type: LinkType) => (t === undefined ? { type } : { type, start: t });

  if (/\.(png|jpe?g|gif|webp|avif)$/i.test(url.pathname)) return { type: "image" };
  if (/\.(mp4|webm|mov|mkv)$/i.test(url.pathname)) return { type: "video-file" };

  if (host === "youtu.be") return withStart("youtube-video");
  if (host === "youtube.com") {
    const [first] = parts;
    if (first === "watch" || first === "live" || first === "shorts") {
      return withStart("youtube-video");
    }
    if (first === "clip") return { type: "youtube-clip" };
    return { type: "youtube-channel" }; // channel/, user/, c/, @handle, or a bare name
  }

  if (host === "clips.twitch.tv") return { type: "twitch-clip" };
  if (host === "twitch.tv") {
    if (parts[0] === "videos") return withStart("twitch-vod");
    if (parts[1] === "clip") return { type: "twitch-clip" };
    return { type: "twitch-channel" };
  }

  if (host === "kick.com") {
    if (parts[0] === "video" || parts[1] === "videos") return withStart("kick-vod");
    if (parts[1] === "clips" || parts[0] === "clip") return { type: "kick-clip" };
    return { type: "kick-channel" };
  }

  if (host === "streamable.com") return { type: "streamable" };

  if (host === "reddit.com" || host === "redd.it") {
    if (host === "redd.it" || parts.includes("comments") || parts[2] === "s") {
      return { type: "reddit-post" };
    }
    if (parts[0] === "user" || parts[0] === "u") return { type: "reddit-user" };
    return { type: "reddit-subreddit" };
  }

  if (host === "x.com" || host === "twitter.com") {
    return parts[1] === "status" ? { type: "x-post" } : { type: "x-profile" };
  }

  if (host === "destiny.gg" && parts[0] === "u" && parts[1]) return { type: "dgg-profile" };
  if (host === "wiki.destiny.gg") return { type: "wiki" };
  return { type: "web" };
}

/**
 * The source link, starting at `start` seconds where the platform supports
 * it, so viewers can open the full context at the right moment.
 */
export function linkAt(raw: string, start: number | null | undefined): string {
  if (start === null || start === undefined) return raw;
  const { type } = classifyLink(raw);
  const url = new URL(raw);
  if (type === "youtube-video") {
    url.searchParams.set("t", `${Math.floor(start)}s`);
  } else if (type === "twitch-vod") {
    const s = Math.floor(start);
    url.searchParams.set("t", `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m${s % 60}s`);
  } else {
    return raw;
  }
  return url.toString();
}

const platformLabels: Record<LinkType, string> = {
  "youtube-video": "YouTube video",
  "youtube-clip": "YouTube clip",
  "youtube-channel": "YouTube channel",
  "twitch-vod": "Twitch VOD",
  "twitch-clip": "Twitch clip",
  "twitch-channel": "Twitch channel",
  "kick-vod": "Kick VOD",
  "kick-clip": "Kick clip",
  "kick-channel": "Kick channel",
  streamable: "Streamable clip",
  "reddit-post": "Reddit post",
  "reddit-subreddit": "Subreddit",
  "reddit-user": "Reddit profile",
  "x-post": "Post on X",
  "x-profile": "X profile",
  "dgg-profile": "DGG profile",
  image: "Image",
  "video-file": "Video",
  wiki: "DGG wiki",
  web: "Website",
};

/** What a link is, for labelling it ("YouTube video at 1:23"). */
export function linkLabel(type: LinkType, start?: number | null): string {
  const label = platformLabels[type];
  return start === null || start === undefined ? label : `${label} at ${formatTimestamp(start)}`;
}
