// Moves the DGGer wildcards into an award of their own, "DGGer wildcards",
// right after DGGer, voted as a top 10 by points (StrawWaffle, 2026-11-10: everyone
// gives a top ten, the points are added up, one ranking and one winner).
// The wildcards are the DGGer nominees whose description mentions
// "wildcard"; they keep their pictures, emotes, links and clips. Their
// titles lose the number from rinlux's list ("52. aus_bits" becomes
// "aus_bits"); the number goes to `listNumber`, which only admins see.
// Groups A–E stay in DGGer.
//
//   bun scripts/split-wildcards.ts [--dry-run]
//
// It backs up first and is one entry in the history: undoing it moves the
// nominees back to DGGer, in their old places and with their old titles, and
// removes the new award (refused once anyone has voted in it).
import {
  backupDatabase,
  categoryHasVotes,
  getCategory,
  getCategoryNominees,
  getNominees,
  insertCategory,
  moveNominee,
  reorderCategories,
  setNomineeFields,
} from "@/lib/data/driver";
import { type MovedNominee, record, serverActor } from "@/server/history";

const FROM = "dgger";
const TO = "dgger_wildcards";
const dry = process.argv.includes("--dry-run");

const from = await getCategory(FROM);
if (!from) throw new Error(`no award "${FROM}"`);
if (await getCategory(TO)) throw new Error(`"${TO}" exists already: nothing to do`);
const wildcards = (await getCategoryNominees(FROM)).filter((o) => /wildcard/i.test(o.description ?? ""));
if (wildcards.length === 0) throw new Error(`no nominees in "${FROM}" mention wildcard`);
if (await categoryHasVotes(FROM)) {
  // Moving a nominee with votes would orphan them; moveNominee refuses those anyway.
  console.log(`note: "${FROM}" has votes; nominees with votes won't move`);
}

/** "52. aus_bits" → title "aus_bits", number 52. A title that's only a number stays as it is. */
const split = (title: string) => {
  const m = title.match(/^(\d+)\.\s*(.+)$/);
  return m ? { title: m[2]!.trim(), listNumber: Number(m[1]) } : null;
};
/**
 * The fields a wildcard changes on the way: the title loses its number, and
 * the description loses DGGer's old group note ("Wildcards, 67 to choose
 * from, top 5 advance:"), which the new award's rules replace.
 */
function changes(o: (typeof wildcards)[number]) {
  const s = split(o.title);
  const description = (o.description ?? "").replace(/\s*Wildcards?,.*$/i, "").trim() || null;
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
console.log(`${dry ? "Would create" : "Creating"} "${TO}" after "${from.title}" and move ${wildcards.length} nominees:`);
for (const o of wildcards) {
  const s = split(o.title);
  console.log(`  ${o.title.padEnd(26)} → ${s ? `${s.title} (#${s.listNumber} on the list, admins only)` : "title kept"}`);
}
const sample = wildcards[0] && changes(wildcards[0])?.after.description;
if (sample !== undefined) console.log(`descriptions: "${wildcards[0]!.description}" → "${sample ?? ""}"`);
if (dry) process.exit(0);

console.log("backup:", await backupDatabase("before-split-wildcards"));

const moved: MovedNominee[] = [];
let created = false;
// The history entry is written whatever happens, so undo always covers what was done.
try {
  await insertCategory({
    id: TO,
    title: "DGGer wildcards",
    description: "The best of the wildcard chatters, from everyone's top 10.",
    votingStyle: "points",
  });
  created = true;
  const order = (await getNominees({ includeHidden: true })).map((c) => c.id).filter((id) => id !== TO);
  order.splice(order.indexOf(FROM) + 1, 0, TO);
  await reorderCategories(order);
  for (const o of wildcards) {
    await moveNominee(FROM, o.id, TO);
    const fields = changes(o) as MovedNominee["fields"];
    if (fields) await setNomineeFields(TO, o.id, fields.after);
    moved.push({ id: o.id, from: FROM, to: TO, position: o.position, ...(fields ? { fields } : {}) });
  }
} finally {
  if (created) {
    await record(serverActor, {
      kind: "import",
      action: "create",
      label: `Moved ${moved.length} DGGer wildcards into their own award, "DGGer wildcards" (top 10 by points), their list numbers kept for admins and DGGer's group note taken off their descriptions`,
      categoryId: TO,
      after: { categories: [TO], added: [], nominees: moved.length, pictures: [], emotes: [], moved },
    });
  }
}
console.log(`moved ${moved.length} of ${wildcards.length}`);
