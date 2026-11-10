// Adds draft nominees from rinlux's Google Drive clip folders, one per file,
// linked to the Drive video. Until a clip is marked and made in the editor
// (from the library's copy of the same file), the site plays the whole video
// in Drive's player. Pictures (New Emote) become the nominees' pictures, and
// videos get a frame from the library's copy as theirs.
//
//   bun scripts/import-drive-drafts.ts <listing.json> [--dry-run]
//
// <listing.json>: the Drive folder's files, `[{ id, path, type }]` (paths as
// in the library). Folders named after an award go into that award; the
// other folders, and the loose files, get categories of their own at the end.
// "2025 review" is left out (last year's highlights). Files already linked
// from a nominee, or already there by title, are skipped, so it can be run
// again. It's one entry in the
// history: undoing it removes everything it added.
import { join } from "node:path";
import { backupDatabase, getCategory, getNominees, insertCategory, insertNominee } from "@/lib/data/driver";
import { slugify, uniqueId } from "@/lib/ids";
import { driveFileId } from "@/lib/links";
import { thumbnailFromUpload } from "@/server/clips";
import { record, serverActor } from "@/server/history";
import { LIBRARY_DIR, libraryFile } from "@/server/library";

const [listingPath, flag] = process.argv.slice(2);
if (!listingPath) throw new Error("usage: import-drive-drafts.ts <listing.json> [--dry-run]");
const dry = flag === "--dry-run";
const listing: { id: string; path: string; type: string }[] = await Bun.file(listingPath).json();

/** Award folders, by the award's id. */
const AWARDS: Record<string, string> = {
  "Cutestiny of the Year": "cutestiny",
  "DANKMEMES of the Year": "dankmemes",
  "Derpstiny of the Year": "derp",
  "Godstiny of the Year": "godstiny",
  "OMEGALUL of the Year": "omegalul",
  "REE of the Year": "ree",
  "Shitshow of the Year": "shitshow",
  "Yikestiny of the Year": "yikestiny",
  "Emote of the Year": "emote",
};
/** Folders that aren't awards (yet): categories of their own, at the end. */
const OWN: Record<string, { id: string; title: string; description: string }> = {
  DuckerZ: { id: "duckerz", title: "DuckerZ", description: "Clips from rinlux's DuckerZ folder. Not sorted into an award yet." },
  "bonus memes": { id: "bonus-memes", title: "Bonus memes", description: "Clips from rinlux's bonus memes folder. Not sorted into an award yet." },
  "": { id: "other-clips", title: "Other clips", description: "Loose clips from rinlux's Drive folder. Not sorted into an award yet." },
};
const SKIP = new Set(["2025 review"]);

const VIDEO = /\.(mp4|m4v|mov|mkv|webm)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|avif)$/i;

// destiny.gg's emote names, to spell New Emote nominees as chat does.
const emoteNames = new Map<string, string>();
try {
  const emotes: { prefix: string }[] = await (await fetch("https://cdn.destiny.gg/emotes/emotes.json")).json();
  for (const e of emotes) emoteNames.set(e.prefix.toLowerCase(), e.prefix);
} catch {
  console.log("couldn't load destiny.gg's emote names; using the file names");
}

/** "destiny_says_thanks_to_kinzinger.mp4" → "Destiny says thanks to kinzinger". */
function titleOf(file: string, emote: boolean) {
  const stem = file.replace(/\.[^.]+$/, "").replace(/\s*\[[^\]]*\]\s*$/, "").replace(/\s*\(\d+\)\s*$/, "");
  if (emote) return emoteNames.get(stem.toLowerCase()) ?? stem;
  const words = stem.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const current = await getNominees();
const linked = new Set(current.flatMap((c) => c.options.map((o) => driveFileId(o.url))).filter(Boolean));
const titled = new Set(current.flatMap((c) => c.options.map((o) => `${c.id}/${o.title.toLowerCase()}`)));
const plan: { categoryId: string; own?: (typeof OWN)[string]; title: string; file: (typeof listing)[number]; kind: "video" | "image" }[] = [];
for (const file of listing) {
  if (file.type.includes("google-apps")) continue;
  const folder = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";
  const name = file.path.slice(folder ? folder.length + 1 : 0);
  if (SKIP.has(folder)) continue;
  const kind = VIDEO.test(name) ? "video" : IMAGE.test(name) ? "image" : null;
  if (!kind || linked.has(file.id)) continue;
  const categoryId = AWARDS[folder] ?? OWN[folder]?.id;
  if (!categoryId) {
    console.log(`no award for folder "${folder}": skipped ${name}`);
    continue;
  }
  // Pictures have no link: one with the same title there already is it.
  const title = titleOf(name, categoryId === "emote");
  if (titled.has(`${categoryId}/${title.toLowerCase()}`)) continue;
  plan.push({ categoryId, own: AWARDS[folder] ? undefined : OWN[folder], title, file, kind });
}

for (const p of plan) console.log(`${p.categoryId.padEnd(12)} ${p.kind.padEnd(5)} ${p.title}`);
console.log(`${plan.length} drafts`);
if (dry) process.exit(0);

console.log("backup:", await backupDatabase("before-drive-drafts"));

// The Drive id of each library file, for the editor (src/server/library.ts).
const idsFile = Bun.file(join(LIBRARY_DIR, ".drive-ids.json"));
const ids: Record<string, string> = (await idsFile.exists()) ? await idsFile.json() : {};
for (const f of listing) if (!f.type.includes("google-apps")) ids[f.id] = f.path;
await Bun.write(idsFile, JSON.stringify(ids, null, 1));

const newCategories: string[] = [];
const added: { categoryId: string; id: string }[] = [];
const taken = new Map<string, Set<string>>();
for (const p of plan) {
  if (p.own && !(await getCategory(p.own.id)) && !newCategories.includes(p.own.id)) {
    await insertCategory({ id: p.own.id, title: p.own.title, description: p.own.description, votingStyle: null, hidden: false });
    newCategories.push(p.own.id);
  }
  if (!taken.has(p.categoryId)) {
    const cat = (await getNominees()).find((c) => c.id === p.categoryId);
    taken.set(p.categoryId, new Set(cat?.options.map((o) => o.id) ?? []));
  }
  const ids = taken.get(p.categoryId)!;
  const id = uniqueId(slugify(p.title) || "nominee", ids);
  ids.add(id);
  const emote = p.categoryId === "emote";
  await insertNominee({
    id,
    categoryId: p.categoryId,
    title: p.title,
    description: "Draft from rinlux's clip folder.",
    imageId: null,
    videoId: null,
    url: p.kind === "video" ? `https://drive.google.com/file/d/${p.file.id}/view` : null,
    linkType: p.kind === "video" ? "google-drive" : null,
    renderType: emote ? "compact" : "default",
  });
  if (!newCategories.includes(p.categoryId)) added.push({ categoryId: p.categoryId, id });

  const path = await libraryFile(p.file.path);
  if (!path) {
    console.log(`  no library copy of ${p.file.path}: no picture`);
    continue;
  }
  if (p.kind === "video") {
    // A picture for the card until the clip is made: a frame a third in,
    // where built clips take theirs.
    const probe = Bun.spawnSync(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]);
    const at = (Number(probe.stdout.toString().trim()) || 3) / 3;
    const frame = `/tmp/${id}-frame.jpg`;
    const ff = Bun.spawnSync(["ffmpeg", "-v", "error", "-ss", at.toFixed(2), "-i", path, "-frames:v", "1", "-q:v", "3", "-y", frame]);
    if (ff.exitCode === 0) {
      const bytes = await Bun.file(frame).arrayBuffer();
      await thumbnailFromUpload(p.categoryId, id, new File([bytes], "frame.jpg"));
    } else {
      console.log(`  couldn't take a frame from ${p.file.path}`);
    }
  }
  if (p.kind === "image") {
    // AVIF isn't taken as a picture: its first frame as PNG.
    let source = path;
    if (/\.avif$/i.test(path)) {
      source = `/tmp/${id}.png`;
      const ff = Bun.spawnSync(["ffmpeg", "-v", "error", "-i", path, "-frames:v", "1", "-y", source]);
      if (ff.exitCode !== 0) {
        console.log(`  couldn't convert ${p.file.path}: no picture`);
        continue;
      }
    }
    const bytes = await Bun.file(source).arrayBuffer();
    await thumbnailFromUpload(p.categoryId, id, new File([bytes], source.split("/").pop()!));
  }
}

await record(serverActor, {
  kind: "import",
  action: "create",
  label: `Drafts from rinlux's clip folders: ${plan.length} nominees${newCategories.length ? `, ${newCategories.length} new categories` : ""}`,
  after: { categories: newCategories, added, nominees: plan.length },
});
console.log(`added ${plan.length} drafts (${newCategories.length} new categories: ${newCategories.join(", ") || "none"})`);
