// Where clips and thumbnails live. Local disk (the /data volume) by default;
// Cloudflare R2 when its settings are present. Switching is configuration
// only: same keys, same calls.
//
//   Local:  MEDIA_DIR=/data/media           served by the app at /files/<key>
//   R2:     R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
//           R2_PUBLIC_URL (the bucket's public r2.dev or custom-domain URL)
//
// Video should come from R2 in production: Cloudflare's free CDN terms
// restrict serving video through the tunnel, and a home connection can't
// carry thousands of viewers (see docs/handoff.md, "Scale").
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export interface MediaStorage {
  put(key: string, data: Blob, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Public URL for a key. */
  url(key: string): string;
  /** A local file for a key, if this storage serves files itself. */
  localFile?(key: string): Bun.BunFile | null;
}

/** Keys are paths like "clips/emote/glizzy-1a2b3c.mp4": no dots-only parts. */
export const MEDIA_KEY = /^(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;

export function localStorage(dir: string, publicPath = "/files"): MediaStorage {
  const root = resolve(dir);
  const pathOf = (key: string) => {
    if (!MEDIA_KEY.test(key)) throw new Error(`Bad media key: ${key}`);
    const p = resolve(join(root, key));
    if (!p.startsWith(root + "/") && p !== root) throw new Error(`Bad media key: ${key}`);
    return p;
  };
  return {
    async put(key, data) {
      const p = pathOf(key);
      await mkdir(dirname(p), { recursive: true });
      await Bun.write(p, data);
    },
    async delete(key) {
      await rm(pathOf(key), { force: true });
    },
    url: (key) => `${publicPath}/${key}`,
    localFile(key) {
      if (!MEDIA_KEY.test(key)) return null;
      return Bun.file(pathOf(key));
    },
  };
}

export function r2Storage(opts: {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
}): MediaStorage {
  const s3 = new Bun.S3Client({
    endpoint: opts.endpoint,
    bucket: opts.bucket,
    accessKeyId: opts.accessKeyId,
    secretAccessKey: opts.secretAccessKey,
  });
  const base = opts.publicUrl.replace(/\/$/, "");
  return {
    async put(key, data, contentType) {
      await s3.write(key, data, { type: contentType });
    },
    async delete(key) {
      await s3.delete(key);
    },
    url: (key) => `${base}/${key}`,
  };
}

/** The configured storage: R2 if its settings are all present, else local. */
export function storageFromEnv(env = process.env): MediaStorage {
  const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL } = env;
  if (R2_ENDPOINT && R2_BUCKET && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_PUBLIC_URL) {
    return r2Storage({
      endpoint: R2_ENDPOINT,
      bucket: R2_BUCKET,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      publicUrl: R2_PUBLIC_URL,
    });
  }
  return localStorage(env.MEDIA_DIR ?? "./media");
}

export const storage = storageFromEnv();

/**
 * Serve a local file, honouring a single byte range ("bytes=0-99"), which
 * browsers need to seek in video (Safari won't play video without it).
 */
export async function serveFile(file: Bun.BunFile, rangeHeader: string | null): Promise<Response> {
  if (!(await file.exists())) return new Response(null, { status: 404 });
  const size = file.size;
  const headers = {
    "Accept-Ranges": "bytes",
    "Content-Type": file.type,
    "Cache-Control": "public, max-age=3600",
    "X-Robots-Tag": "noindex, nofollow, noarchive, noimageindex, noai, noimageai",
  };
  const range = parseRange(rangeHeader, size);
  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
  }
  if (!range) return new Response(file, { headers });
  const [start, end] = range;
  return new Response(file.slice(start, end + 1), {
    status: 206,
    headers: {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
    },
  });
}

/** [start, end] inclusive, null for no/unsupported range, "invalid" for 416. */
export function parseRange(header: string | null, size: number): [number, number] | null | "invalid" {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m) return null; // absent, or multiple ranges: send the whole file
  const [, a, b] = m;
  if (a === "" && b === "") return "invalid";
  let start: number;
  let end: number;
  if (a === "") {
    // Suffix: the last N bytes.
    start = Math.max(0, size - Number(b));
    end = size - 1;
  } else {
    start = Number(a);
    end = b === "" ? size - 1 : Math.min(Number(b), size - 1);
  }
  if (start >= size || start > end) return "invalid";
  return [start, end];
}
