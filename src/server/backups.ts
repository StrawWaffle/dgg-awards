// Off-site backups to Google Drive (or any rclone remote), so a dead disk or
// a new maintainer loses nothing. Set up in docs/migration.md.
//
// - Every hour: the database (without sessions), as a plain SQLite file, to
//   <remote>/database/. (Until 2026-11-09 they were encrypted with
//   BACKUP_PASSWORD; those .db.enc files still restore with it.)
//   Kept: every copy from the last 2 days, then one a day for 60 days.
// - Once a day: clips and thumbnails (R2 or the local media folder) copied to
//   <remote>/media/.
//
// rclone does the transfers. Its Drive remote "gdrive" comes from the
// RCLONE_CONFIG_GDRIVE_* settings in .env; the job is off without them or
// without them.
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { backupName, backupsToDelete } from "@/lib/backup-names";
import { snapshotDatabase } from "@/lib/data/driver";

const REMOTE = process.env.BACKUP_REMOTE ?? "gdrive:DGG Awards backups";
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const STATUS_FILE = join(dirname(process.env.DB_FILE_NAME ?? "./sqlite.db"), "backups", "offsite.json");

export type OffsiteStatus = {
  enabled: boolean;
  remote: string;
  lastDatabase?: { at: string; ok: boolean; file?: string; bytes?: number; error?: string };
  lastMedia?: { at: string; ok: boolean; error?: string };
};

export function offsiteEnabled() {
  return !!process.env.RCLONE_CONFIG_GDRIVE_TOKEN;
}

export async function offsiteStatus(): Promise<OffsiteStatus> {
  const saved = Bun.file(STATUS_FILE);
  const status = (await saved.exists()) ? ((await saved.json()) as OffsiteStatus) : {};
  return { ...status, enabled: offsiteEnabled(), remote: REMOTE };
}

async function saveStatus(change: Partial<OffsiteStatus>) {
  await mkdir(dirname(STATUS_FILE), { recursive: true });
  const { enabled: _e, remote: _r, ...current } = await offsiteStatus();
  await Bun.write(STATUS_FILE, JSON.stringify({ ...current, ...change }, null, 1));
}

// ---- Transfers --------------------------------------------------------------

async function rclone(args: string[], env: Record<string, string> = {}) {
  const proc = Bun.spawn(["rclone", ...args], {
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => proc.kill(), 30 * 60_000);
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  clearTimeout(timer);
  if (code !== 0) {
    // rclone's last error line, without anything token-like.
    const line = err.trim().split("\n").pop() ?? `rclone exited with ${code}`;
    throw new Error(line.replace(/"(access_token|refresh_token)":"[^"]*"/g, '"$1":"…"').slice(0, 300));
  }
  return out;
}

/** Back up the database now. Returns the file name written to Drive. */
export async function backupDatabaseOffsite(): Promise<string> {
  const at = new Date();
  const name = backupName(at);
  const dir = await mkdtemp(join(tmpdir(), "offsite-"));
  try {
    const sealed = await snapshotDatabase();
    const file = join(dir, name);
    await Bun.write(file, sealed);
    await rclone(["copyto", file, `${REMOTE}/database/${name}`]);
    const names = (await rclone(["lsf", `${REMOTE}/database`, "--files-only"])).split("\n").filter(Boolean);
    for (const old of backupsToDelete(names, at.getTime())) {
      await rclone(["deletefile", `${REMOTE}/database/${old}`]);
    }
    await saveStatus({ lastDatabase: { at: at.toISOString(), ok: true, file: name, bytes: sealed.length } });
    return name;
  } catch (error) {
    await saveStatus({ lastDatabase: { at: at.toISOString(), ok: false, error: (error as Error).message } });
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Copy new clips and thumbnails to Drive (nothing is deleted there). */
export async function backupMediaOffsite() {
  const at = new Date().toISOString();
  const r2 = ["R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"].every((k) => process.env[k]);
  try {
    if (r2) {
      await rclone(["copy", `r2media:${process.env.R2_BUCKET}`, `${REMOTE}/media`], {
        RCLONE_CONFIG_R2MEDIA_TYPE: "s3",
        RCLONE_CONFIG_R2MEDIA_PROVIDER: "Cloudflare",
        RCLONE_CONFIG_R2MEDIA_ENDPOINT: process.env.R2_ENDPOINT!,
        RCLONE_CONFIG_R2MEDIA_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID!,
        RCLONE_CONFIG_R2MEDIA_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY!,
        RCLONE_CONFIG_R2MEDIA_NO_CHECK_BUCKET: "true",
      });
    } else {
      const dir = process.env.MEDIA_DIR ?? "./media";
      // No media folder yet: no clips or pictures to copy.
      if (existsSync(dir)) {
        await rclone(["copy", dir, `${REMOTE}/media`]);
      }
    }
    await saveStatus({ lastMedia: { at, ok: true } });
  } catch (error) {
    await saveStatus({ lastMedia: { at, ok: false, error: (error as Error).message } });
    throw error;
  }
}

/**
 * Start the schedule: the database every hour (first a few minutes after
 * start), media when the last copy is a day old. Call once at startup.
 */
export function startOffsiteBackups() {
  if (!offsiteEnabled()) {
    console.log("Off-site backups are off (no RCLONE_CONFIG_GDRIVE_TOKEN).");
    return;
  }
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await backupDatabaseOffsite();
      const media = (await offsiteStatus()).lastMedia;
      if (!media?.ok || Date.now() - Date.parse(media.at) > DAY - HOUR / 2) await backupMediaOffsite();
    } catch (error) {
      console.error("Off-site backup failed:", (error as Error).message);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 3 * 60_000);
  setInterval(tick, HOUR);
}
