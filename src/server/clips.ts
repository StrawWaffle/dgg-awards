// Turns a nominee's source link + clip range into a short mp4 we host
// ourselves, plus a thumbnail. yt-dlp fetches only the section, ffmpeg
// converts it to one web-friendly format (≤720p H.264/AAC, fast start).
//
// Jobs run one at a time, in the background. Their state lives on the nominee
// (clipStatus/clipError), so the admin page can show it and a restart picks
// up unfinished jobs (resumeClipJobs).
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getNominee, listUnfinishedClips, setNomineeMedia } from "@/lib/data/driver";
import { classifyLink, videoLinkTypes } from "@/lib/links";
import { nomineeLabel, record, serverActor } from "@/server/history";
import { storage } from "@/server/storage";

/** Longest section we'll download (seconds). Clips should be well under it. */
export const MAX_CLIP_SECONDS = 180;
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
const ENCODE_TIMEOUT_MS = 5 * 60_000;
const THUMB_WIDTH = 640;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Prefer H.264 + AAC at ≤1080p (no second encode needed), else what exists. */
const FORMAT =
  "bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/b";

/**
 * Quality budget. Bandwidth from R2 is free; this keeps storage and mobile
 * data sane: a typical 15–20 s clip is 4–8 MB, a 60 s one at most ~30 MB.
 */
const MAX_HEIGHT = 1080;
const MAX_VIDEO_KBPS = 4000;

type Nominee = NonNullable<Awaited<ReturnType<typeof getNominee>>>;

/** Why a nominee can't have a clip built, or null if it can. */
export function clipProblem(n: Pick<Nominee, "url" | "linkType" | "clipStart" | "clipEnd">): string | null {
  if (!n.url) return "No source link.";
  const type = n.linkType ?? classifyLink(n.url).type;
  if (!videoLinkTypes.has(type)) return "The source link isn't a video.";
  if (n.clipStart == null || n.clipEnd == null) return "Set the clip's start and end first.";
  if (n.clipEnd <= n.clipStart) return "The clip's end must come after its start.";
  if (n.clipEnd - n.clipStart > MAX_CLIP_SECONDS) {
    return `Clips can be at most ${MAX_CLIP_SECONDS} seconds.`;
  }
  return null;
}

// ---- Queue ----------------------------------------------------------------

let queue: Promise<unknown> = Promise.resolve();
const queued = new Set<string>();

/** Mark the nominee pending and build its clip in the background. */
export async function enqueueClip(categoryId: string, id: string) {
  const key = `${categoryId}/${id}`;
  await setNomineeMedia(categoryId, id, { clipStatus: "pending", clipError: null });
  if (queued.has(key)) return;
  queued.add(key);
  queue = queue.then(async () => {
    queued.delete(key);
    try {
      await buildClip(categoryId, id);
    } catch (error) {
      console.error(`Clip ${key} failed:`, error);
      await setNomineeMedia(categoryId, id, {
        clipStatus: "failed",
        clipError: errorText(error),
      });
    }
  });
}

/** Re-queue jobs a restart interrupted. Call once at startup. */
export async function resumeClipJobs() {
  for (const n of await listUnfinishedClips()) {
    await enqueueClip(n.categoryId, n.id);
  }
}

/** Resolves when every queued job has finished (for tests and shutdown). */
export function clipQueueIdle() {
  return queue;
}

// ---- Building -------------------------------------------------------------

async function buildClip(categoryId: string, id: string) {
  const n = await getNominee(categoryId, id);
  if (!n) return; // deleted while queued
  const problem = clipProblem(n);
  if (problem) throw new Error(problem);
  await setNomineeMedia(categoryId, id, { clipStatus: "processing" });

  const dir = await mkdtemp(join(tmpdir(), "clip-"));
  try {
    const start = n.clipStart!;
    const end = n.clipEnd!;
    await run(
      "yt-dlp",
      [
        "--js-runtimes", "bun",
        "--no-playlist",
        "--no-progress",
        "-f", FORMAT,
        "--download-sections", `*${start}-${end}`,
        "--force-keyframes-at-cuts",
        "--merge-output-format", "mp4",
        "--max-filesize", "500M",
        "-o", join(dir, "source.%(ext)s"),
        n.url!,
      ],
      DOWNLOAD_TIMEOUT_MS,
    );
    const source = (await readdir(dir)).find((f) => f.startsWith("source."));
    if (!source) throw new Error("yt-dlp finished without a file.");

    // yt-dlp's precise cut already encoded once. Only encode again if the
    // result doesn't fit (codec, size, bitrate); otherwise just repackage
    // for fast start, since every encode loses detail.
    const out = join(dir, "clip.mp4");
    const input = join(dir, source);
    const info = await probeStreams(input);
    const fits =
      info.video?.codec === "h264" &&
      (info.video.height ?? Infinity) <= MAX_HEIGHT &&
      (info.video.kbps ?? Infinity) <= MAX_VIDEO_KBPS * 1.1 &&
      (info.audio === null || info.audio.codec === "aac");
    await run(
      "ffmpeg",
      fits
        ? ["-y", "-i", input, "-c", "copy", "-movflags", "+faststart", out]
        : [
            "-y", "-i", input,
            "-vf", `scale=-2:'min(${MAX_HEIGHT},ih)'`,
            "-c:v", "libx264", "-preset", "medium", "-crf", "21",
            "-maxrate", `${MAX_VIDEO_KBPS}k`, "-bufsize", `${MAX_VIDEO_KBPS * 2}k`,
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k",
            "-movflags", "+faststart",
            out,
          ],
      ENCODE_TIMEOUT_MS,
    );

    const duration = await probeDuration(out);
    const at = Math.floor(duration / 3);
    const version = (await sha256(`${n.url}|${start}|${end}`)).slice(0, 10);
    const clipKey = `clips/${categoryId}/${id}-${version}.mp4`;
    await storage.put(clipKey, Bun.file(out), "video/mp4");
    const thumbnailKey = await thumbnailFromVideo(out, categoryId, id, at, dir);

    await setNomineeMedia(categoryId, id, {
      clipKey,
      clipStatus: "ready",
      clipError: null,
      thumbnailKey,
      thumbnailAt: at,
    });
    await removeReplaced([n.clipKey, n.thumbnailKey], [clipKey, thumbnailKey]);
    // In the history as the server's change, so the old clip can be put back.
    // "Before" is the clip as it was, not the in-progress status.
    await record(serverActor, {
      kind: "nominee",
      action: "update",
      label: await nomineeLabel(categoryId, n.title),
      categoryId,
      nomineeId: id,
      before: {
        clipKey: n.clipKey,
        clipStatus: n.clipKey ? "ready" : null,
        clipError: null,
        thumbnailKey: n.thumbnailKey,
        thumbnailAt: n.thumbnailAt,
      },
      after: { clipKey, clipStatus: "ready", clipError: null, thumbnailKey, thumbnailAt: at },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** A thumbnail from the clip at `at` seconds. The clip must be ready. */
export async function thumbnailFromClip(categoryId: string, id: string, at: number) {
  const n = await getNominee(categoryId, id);
  if (!n?.clipKey || n.clipStatus !== "ready") throw new UserError("This nominee has no ready clip.");
  const dir = await mkdtemp(join(tmpdir(), "thumb-"));
  try {
    const clip = await localCopy(n.clipKey, dir);
    const duration = await probeDuration(clip);
    if (at < 0 || at >= duration) {
      throw new UserError(`Pick a time between 0 and ${Math.floor(duration)} seconds.`);
    }
    const thumbnailKey = await thumbnailFromVideo(clip, categoryId, id, at, dir);
    await setNomineeMedia(categoryId, id, { thumbnailKey, thumbnailAt: at });
    await removeReplaced([n.thumbnailKey], [thumbnailKey]);
    return thumbnailKey;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Use an uploaded image as the thumbnail. It's re-encoded through ffmpeg, so
 * only a plain JPEG we made ourselves is stored and served.
 */
export async function thumbnailFromUpload(categoryId: string, id: string, file: File) {
  const n = await getNominee(categoryId, id);
  if (!n) throw new UserError("No such nominee.");
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
    throw new UserError("Upload a PNG, JPEG, WebP or GIF image.");
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new UserError("Images can be at most 5 MB.");
  const dir = await mkdtemp(join(tmpdir(), "upload-"));
  try {
    const input = join(dir, "upload");
    await Bun.write(input, file);
    const out = join(dir, "thumb.jpg");
    try {
      await run(
        "ffmpeg",
        ["-y", "-i", input, "-frames:v", "1", "-vf", `scale='min(${THUMB_WIDTH},iw)':-2`, "-q:v", "3", out],
        60_000,
      );
    } catch {
      throw new UserError("That file couldn't be read as an image.");
    }
    const digest = (await sha256(await Bun.file(out).bytes())).slice(0, 10);
    const thumbnailKey = `thumbs/${categoryId}/${id}-upload-${digest}.jpg`;
    await storage.put(thumbnailKey, Bun.file(out), "image/jpeg");
    await setNomineeMedia(categoryId, id, { thumbnailKey, thumbnailAt: null });
    await removeReplaced([n.thumbnailKey], [thumbnailKey]);
    return thumbnailKey;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ---- Helpers --------------------------------------------------------------

/** An error the admin should see as-is (400), not a server failure. */
export class UserError extends Error {}

async function thumbnailFromVideo(video: string, categoryId: string, id: string, at: number, dir: string) {
  const out = join(dir, `thumb-${at}.jpg`);
  await run(
    "ffmpeg",
    ["-y", "-ss", String(at), "-i", video, "-frames:v", "1", "-vf", `scale='min(${THUMB_WIDTH},iw)':-2`, "-q:v", "3", out],
    60_000,
  );
  const digest = (await sha256(await Bun.file(out).bytes())).slice(0, 10);
  const key = `thumbs/${categoryId}/${id}-${at}s-${digest}.jpg`;
  await storage.put(key, Bun.file(out), "image/jpeg");
  return key;
}

/** A path to the stored file: the file itself if local, else a download. */
async function localCopy(key: string, dir: string) {
  const local = storage.localFile?.(key);
  if (local?.name && (await local.exists())) return local.name;
  const res = await fetch(storage.url(key));
  if (!res.ok) throw new Error(`Couldn't fetch ${key}: ${res.status}`);
  const path = join(dir, "clip.mp4");
  await Bun.write(path, res);
  return path;
}

/**
 * Replaced files are kept: the edit history can put an old clip or thumbnail
 * back, and the keys are versioned, so nothing is overwritten. Unused files
 * could be swept up after the awards.
 */
async function removeReplaced(_old: (string | null)[], _current: string[]) {}

/** Codec, height and bitrate of the first video and audio streams. */
async function probeStreams(path: string) {
  const { stdout } = await run(
    "ffprobe",
    ["-v", "error", "-show_entries", "stream=codec_type,codec_name,height,bit_rate:format=bit_rate", "-of", "json", path],
    30_000,
  );
  const data = JSON.parse(stdout) as {
    streams: { codec_type: string; codec_name: string; height?: number; bit_rate?: string }[];
    format?: { bit_rate?: string };
  };
  const v = data.streams.find((s) => s.codec_type === "video");
  const a = data.streams.find((s) => s.codec_type === "audio");
  const kbps = (s?: string) => (s ? Number(s) / 1000 : undefined);
  return {
    // Some containers only report the overall bitrate; use it as an upper bound.
    video: v ? { codec: v.codec_name, height: v.height, kbps: kbps(v.bit_rate) ?? kbps(data.format?.bit_rate) } : null,
    audio: a ? { codec: a.codec_name } : null,
  };
}

async function probeDuration(path: string) {
  const { stdout } = await run(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path],
    30_000,
  );
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("The clip has no duration.");
  return seconds;
}

async function sha256(data: string | Uint8Array) {
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(data);
  return hash.digest("hex");
}

/** Run a program; reject with the end of its stderr if it fails or times out. */
async function run(cmd: string, args: string[], timeoutMs: number) {
  const proc = Bun.spawn([cmd, ...args], { stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  if (code !== 0) {
    const reason = proc.signalCode ? `timed out after ${timeoutMs / 1000}s` : `exited with ${code}`;
    throw new Error(`${cmd} ${reason}: ${lastLines(stderr)}`);
  }
  return { stdout, stderr };
}

function lastLines(text: string) {
  const lines = text.trim().split("\n");
  const errors = lines.filter((l) => /^ERROR:/.test(l));
  return (errors.length ? errors : lines.slice(-3)).join(" ").slice(0, 400);
}

function errorText(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}
