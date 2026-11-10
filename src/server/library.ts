// The video library: clips and pictures the admins collected elsewhere (for
// 2025, rinlux's Google Drive folder), copied onto the server so clips can be
// cut from them in the editor without downloading anything. It lives next to
// the database, on its volume, and is only ever served to admins.
//
// Fill it with scripts/import-drive.py (see the handoff). Folders are kept,
// and a folder named like an award is listed first in that award's editor.
import { readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

export const LIBRARY_DIR = resolve(dirname(process.env.DB_FILE_NAME ?? "./sqlite.db"), "library");

const VIDEO = new Set(["mp4", "m4v", "mov", "mkv", "webm"]);
const IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif"]);

export type LibraryItem = {
  /** Relative to the library, with forward slashes: "Emote of the Year/x.mp4". */
  path: string;
  /** Its folder, or "" for the top level. */
  folder: string;
  name: string;
  kind: "video" | "image";
  size: number;
  /** The Google Drive file it was copied from, if known. */
  driveId: string | null;
};

/**
 * Drive file id → library path, written by scripts/import-drive.py as
 * `.drive-ids.json` in the library.
 */
async function driveIds(): Promise<Record<string, string>> {
  const f = Bun.file(join(LIBRARY_DIR, ".drive-ids.json"));
  try {
    return (await f.exists()) ? await f.json() : {};
  } catch {
    return {};
  }
}

/** The library path of a Google Drive file's copy, or null if there's none. */
export async function libraryPathForDrive(driveId: string): Promise<string | null> {
  const path = (await driveIds())[driveId];
  return path && (await libraryFile(path)) ? path : null;
}

export async function listLibrary(): Promise<LibraryItem[]> {
  const items: LibraryItem[] = [];
  const byPath = new Map(Object.entries(await driveIds()).map(([id, path]) => [path, id]));
  const walk = async (dir: string) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // no library yet
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
        continue;
      }
      const ext = e.name.split(".").pop()?.toLowerCase() ?? "";
      const kind = VIDEO.has(ext) ? "video" : IMAGE.has(ext) ? "image" : null;
      if (!kind) continue;
      const path = relative(LIBRARY_DIR, full).split(sep).join("/");
      const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      items.push({ path, folder, name: e.name, kind, size: (await stat(full)).size, driveId: byPath.get(path) ?? null });
    }
  };
  await walk(LIBRARY_DIR);
  return items.sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
}

/** The file for a library path, or null if it's outside the library or missing. */
export async function libraryFile(path: string): Promise<string | null> {
  const full = resolve(LIBRARY_DIR, path);
  if (full !== LIBRARY_DIR && !full.startsWith(LIBRARY_DIR + sep)) return null;
  try {
    return (await stat(full)).isFile() ? full : null;
  } catch {
    return null;
  }
}
