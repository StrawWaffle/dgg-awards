// Splits DGGer's group stage into five awards, "DGGer Group A" to "E", after
// "DGGer wildcards", and leaves "DGG Chatter of the Year" (`dgger`) empty as
// the final, after them (rinlux, 2026-11-20: wildcards days 1–7, groups days
// 8–11, rank your top 3 by instant runoff, top 2 of each group to the final;
// the final is ranked too).
//
// - A nominee's group comes from its description: "Group A (Conductors & Attn
//   Whores)." The group's name goes on the award; the note leaves the
//   nominee's description.
// - Titles lose the number from rinlux's list ("1. Pizza" → "Pizza"); the
//   number goes to `listNumber`, which only admins see.
// - Group A's "12." is a blank line in rinlux's list (rinlux): it's deleted.
// - The groups and the final are ranked.
//
//   bun scripts/split-dgger-groups.ts [--dry-run]
//
// It backs up first. The history gets one entry for the split (undo moves
// everyone back with their old titles and descriptions, and removes the five
// awards), one for the order, one for the final's style and one for the blank.
import {
  backupDatabase,
  categoryHasVotes,
  deleteNominee,
  getCategory,
  getCategoryNominees,
  getNominees,
  insertCategory,
  moveNominee,
  reorderCategories,
  setCategoryFields,
  setNomineeFields,
} from "@/lib/data/driver";
import { type MovedNominee, categoryOrder, record, serverActor } from "@/server/history";

const FROM = "dgger";
const AFTER = "dgger_wildcards";
const dry = process.argv.includes("--dry-run");

const from = await getCategory(FROM);
if (!from) throw new Error(`no award "${FROM}"`);
if (await categoryHasVotes(FROM)) throw new Error(`"${FROM}" has votes: split it by hand`);
const nominees = await getCategoryNominees(FROM);
const GROUP = /\s*Group ([A-E]) \(([^)]*)\)\.?/;

const groups = new Map<string, { name: string; nominees: typeof nominees }>();
const blanks: typeof nominees = [];
for (const o of nominees) {
  const m = (o.description ?? "").match(GROUP);
  if (!m) throw new Error(`"${o.title}" has no group in its description`);
  // "12." with nothing after it: the blank line in rinlux's list.
  if (/^\d+\.\s*$/.test(o.title)) {
    blanks.push(o);
    continue;
  }
  const g = groups.get(m[1]!) ?? { name: m[2]!, nominees: [] };
  g.nominees.push(o);
  groups.set(m[1]!, g);
}
const letters = [...groups.keys()].sort();
for (const l of letters) if (await getCategory(`dgger_group_${l.toLowerCase()}`)) throw new Error(`dgger_group_${l.toLowerCase()} exists already`);

/** "1. Pizza" → "Pizza", 1. */
const split = (title: string) => {
  const m = title.match(/^(\d+)\.\s*(.+)$/);
  return m ? { title: m[2]!.trim(), listNumber: Number(m[1]) } : null;
};
function changes(o: (typeof nominees)[number]) {
  const s = split(o.title);
  const description = (o.description ?? "").replace(GROUP, "").trim() || null;
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  if (s) {
    Object.assign(before, { title: o.title, listNumber: o.listNumber });
    Object.assign(after, s);
  }
  if (description !== o.description) {
    before.description = o.description;
    after.description = description;
  }
  return Object.keys(after).length ? { before, after } : undefined;
}

for (const l of letters) {
  const g = groups.get(l)!;
  console.log(`DGGer Group ${l} (${g.name}): ${g.nominees.length} → ${g.nominees.map((o) => split(o.title)?.title ?? o.title).join(", ")}`);
}
console.log(`blank, to delete: ${blanks.map((o) => `"${o.title}" (${o.id})`).join(", ") || "none"}`);
console.log(`"${from.title}" stays as the final, empty, after the groups, ranked`);
if (dry) process.exit(0);

console.log("backup:", await backupDatabase("before-split-dgger-groups"));

const moved: MovedNominee[] = [];
const created: string[] = [];
const orderBefore = await categoryOrder();
try {
  for (const l of letters) {
    const g = groups.get(l)!;
    const id = `dgger_group_${l.toLowerCase()}`;
    await insertCategory({
      id,
      title: `DGGer Group ${l}`,
      description: `${g.name}. Rank your top 3: the top two go through to DGG Chatter of the Year.`,
      votingStyle: "ranked",
    });
    created.push(id);
    for (const o of g.nominees) {
      await moveNominee(FROM, o.id, id);
      const fields = changes(o) as MovedNominee["fields"];
      if (fields) await setNomineeFields(id, o.id, fields.after);
      moved.push({ id: o.id, from: FROM, to: id, position: o.position, ...(fields ? { fields } : {}) });
    }
  }
} finally {
  if (created.length) {
    await record(serverActor, {
      kind: "import",
      action: "create",
      label: `Split DGGer's group stage into ${created.length} awards, "DGGer Group A" to "E" (ranked), with their list numbers kept for admins and the group note taken off the descriptions`,
      categoryId: FROM,
      after: { categories: created, added: [], nominees: moved.length, pictures: [], emotes: [], moved },
    });
  }
}

// Wildcards, then the groups, then the final.
const order = orderBefore.filter((id) => id !== FROM && !created.includes(id));
order.splice(order.indexOf(AFTER) + 1, 0, ...created, FROM);
await reorderCategories(order);
await record(serverActor, { kind: "order", action: "update", label: "Awards", before: { ids: orderBefore }, after: { ids: order } });

const finalBefore = (await getCategory(FROM))!;
if (finalBefore.votingStyle !== "ranked") {
  await setCategoryFields(FROM, { votingStyle: "ranked" });
  await record(serverActor, {
    kind: "category",
    action: "update",
    label: finalBefore.title,
    categoryId: FROM,
    before: { votingStyle: finalBefore.votingStyle },
    after: { votingStyle: "ranked" },
  });
}

for (const o of blanks) {
  await deleteNominee(FROM, o.id);
  await record(serverActor, { kind: "nominee", action: "delete", label: `${o.title} · ${from.title}`, categoryId: FROM, nomineeId: o.id, before: { ...o } });
}
console.log(`moved ${moved.length}, created ${created.length} awards, deleted ${blanks.length} blank`);
