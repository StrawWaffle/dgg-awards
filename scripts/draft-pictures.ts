// Gives nominees that have no picture a draft: the people in the person
// awards the main picture of their page on the DGG wiki (wiki.destiny.gg),
// and chatters an emote, drawn where the picture goes (the nominee's
// `emote`). Nominees with a picture or an emote are never touched; either
// can be changed in the editor like any other.
//
//   bun scripts/draft-pictures.ts <top-emotes.json> [--dry-run]
//
// <top-emotes.json>: each chatter's most-used emotes this year, from the chat
// logs (dgg-scs): `{ "<nick>": { emotes: <total uses>, top: [["OMEGALUL",
// 1141], …] } }`. A chatter gets the emote that is most theirs: of their top
// five, the one with the largest share of their emotes, weighed down the more
// of the other chatters have it in their top five too (so OMEGALUL, everyone's
// favourite, rarely wins). Only emotes destiny.gg still has are used.
//
// It's one entry in the history: undoing it takes the pictures and emotes off
// again (except any changed since).
import { backupDatabase, getNominees, setNomineeFields } from "@/lib/data/driver";
import { thumbnailFromUpload } from "@/server/clips";
import { type ImportedEmote, type ImportedPicture, record, serverActor } from "@/server/history";

const [emotesPath, flag] = process.argv.slice(2);
if (!emotesPath) throw new Error("usage: draft-pictures.ts <top-emotes.json> [--dry-run]");
const dry = flag === "--dry-run";

/** The chatters' award: each nominee is a destiny.gg name, numbered ("12. Nick"). */
const CHATTERS = "dgger";
/** Awards whose nominees are people: a wiki picture, else their emote if they chat. */
const PEOPLE = new Set(["ally", "antagonist", "brainlet", "buddy", "employee", "frenemy"]);
/**
 * Wiki pages by the nominee's name (the title before any "(…)"), checked by
 * hand: the wiki's search alone picks the wrong page too often.
 */
const WIKI: Record<string, string> = {
  imreallyimportant: "ImReallyImportant",
  hutch: "Hutch",
  whicktv: "WhickTV",
  zee: "Zee",
  pisco: "Pisco",
  hasan: "Hasan Piker",
  soypill: "Soypill",
  darius: "Darius",
  prsek: "PRSEK",
  bing: "Bing",
  "vegan gaines": "Vegan Gains",
  radiant: "Radiant",
  "lauren delagoona": "Lauren DeLaguna",
};

const UA = { "User-Agent": "dgg-awards" };
const pause = () => new Promise((r) => setTimeout(r, 300));

/** The main picture of each wiki page, by the titles asked for. */
async function wikiPictures(titles: string[]) {
  const url = new URL("https://wiki.destiny.gg/api.php");
  url.search = new URLSearchParams({
    action: "query",
    titles: titles.join("|"),
    prop: "pageimages",
    piprop: "original",
    redirects: "1",
    format: "json",
  }).toString();
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`the wiki answered ${res.status}`);
  const { query } = (await res.json()) as {
    query: {
      normalized?: { from: string; to: string }[];
      redirects?: { from: string; to: string }[];
      pages: Record<string, { title: string; original?: { source: string } }>;
    };
  };
  const final = (t: string) => {
    t = query.normalized?.find((n) => n.from === t)?.to ?? t;
    return query.redirects?.find((r) => r.from === t)?.to ?? t;
  };
  const byTitle = new Map(Object.values(query.pages).map((p) => [p.title, p.original?.source ?? null]));
  return new Map(titles.map((t) => [t, byTitle.get(final(t)) ?? null]));
}

// The emote that is most each chatter's (see the top of the file).
type Usage = { emotes: number; top: [string, number][] };
const usage: Record<string, Usage> = await Bun.file(emotesPath).json();
const known = new Set(
  ((await (await fetch("https://cdn.destiny.gg/emotes/emotes.json", { headers: UA })).json()) as { prefix: string }[]).map(
    (e) => e.prefix,
  ),
);
const chatters = Object.values(usage).filter((u) => u.top.length > 0);
const tops = new Map<string, number>();
for (const u of chatters) for (const [e] of u.top) tops.set(e, (tops.get(e) ?? 0) + 1);
const usageByNick = new Map(Object.entries(usage).map(([nick, u]) => [nick.toLowerCase(), u]));
function emoteOf(nick: string) {
  const u = usageByNick.get(nick.toLowerCase());
  if (!u?.top.length || !u.emotes) return null;
  const scored = u.top
    .filter(([e]) => known.has(e))
    .map(([e, n]) => ({ e, score: (n / u.emotes) * Math.log(chatters.length / tops.get(e)!) }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.e ?? null;
}

/** The name a nominee's title stands for: "Hasan (cant explain socialism)" → "hasan". */
const nameOf = (title: string) => title.replace(/\s*\(.*$/, "").trim().toLowerCase();

const pictures: { categoryId: string; id: string; title: string; source: string; page: string }[] = [];
const emotes: { categoryId: string; id: string; title: string; emote: string }[] = [];
const skipped: string[] = [];

const categories = await getNominees();
const wiki = await wikiPictures([...new Set(Object.values(WIKI))]);

for (const category of categories) {
  if (category.id !== CHATTERS && !PEOPLE.has(category.id)) continue;
  for (const n of category.options) {
    if (n.thumbnailKey || n.imageId || n.emote) continue;
    const where = `${category.id}/${n.title}`;
    const page = category.id === CHATTERS ? undefined : WIKI[nameOf(n.title)];
    const source = page && wiki.get(page);
    if (page && source) {
      pictures.push({ categoryId: category.id, id: n.id, title: n.title, source, page });
      continue;
    }
    const nick = category.id === CHATTERS ? n.title.replace(/^\d+\.\s*/, "").trim() : nameOf(n.title);
    const emote = nick ? emoteOf(nick) : null;
    if (emote) emotes.push({ categoryId: category.id, id: n.id, title: n.title, emote });
    else skipped.push(`${where}: ${page ? `no picture on the wiki page ${page}, and ` : ""}no emotes in chat this year`);
  }
}

for (const p of pictures) console.log(`${p.categoryId.padEnd(12)} ${p.title.slice(0, 40).padEnd(40)} wiki: ${p.page}  ${p.source}`);
for (const e of emotes) console.log(`${e.categoryId.padEnd(12)} ${e.title.slice(0, 40).padEnd(40)} emote: ${e.emote}`);
console.log(`\nleft as they are:`);
for (const s of skipped) console.log(`  ${s}`);
console.log(`\n${pictures.length} wiki pictures, ${emotes.length} emotes, ${skipped.length} left as they are`);
if (dry) process.exit(0);

console.log("backup:", await backupDatabase("before-draft-pictures"));

const donePictures: ImportedPicture[] = [];
const doneEmotes: ImportedEmote[] = [];
// The history entry is written whatever happens, so undo always covers what was set.
try {
  for (const e of emotes) {
    await setNomineeFields(e.categoryId, e.id, { emote: e.emote });
    doneEmotes.push({ categoryId: e.categoryId, id: e.id, from: null, to: e.emote });
  }
  for (const p of pictures) {
    try {
      const source = new URL(p.source);
      if (source.hostname !== "wikicdn.destiny.gg") throw new Error(`not from the wiki: ${p.source}`);
      const res = await fetch(source, { headers: UA });
      if (!res.ok) throw new Error(`the wiki answered ${res.status}`);
      const name = source.pathname.split("/").pop() || "picture";
      const to = await thumbnailFromUpload(p.categoryId, p.id, new File([await res.arrayBuffer()], name));
      donePictures.push({ categoryId: p.categoryId, id: p.id, from: null, to });
    } catch (error) {
      console.log(`  no picture for ${p.categoryId}/${p.title}: ${(error as Error).message}`);
    }
    await pause();
  }
} finally {
  await record(serverActor, {
    kind: "import",
    action: "create",
    label: `Drafts: ${donePictures.length} pictures from the DGG wiki, ${doneEmotes.length} chatters' emotes`,
    after: { categories: [], added: [], nominees: 0, pictures: donePictures, emotes: doneEmotes },
  });
}
console.log(`set ${donePictures.length} of ${pictures.length} pictures and ${doneEmotes.length} emotes`);
