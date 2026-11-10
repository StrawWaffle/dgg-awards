// Moves the DGGer wildcards into an award of their own, "DGGer wildcards",
// right after DGGer, voted as a top 10 by points (StrawWaffle, 2026-11-10: everyone
// gives a top ten, the points are added up, one ranking and one winner).
// The wildcards are the DGGer nominees whose description mentions
// "wildcard"; they keep their pictures, emotes, links and clips. Groups A–E
// stay in DGGer.
//
//   bun scripts/split-wildcards.ts [--dry-run]
//
// It backs up first and is one entry in the history: undoing it moves the
// nominees back to DGGer, in their old places, and removes the new award
// (refused once anyone has voted in it).
import {
  backupDatabase,
  categoryHasVotes,
  getCategory,
  getCategoryNominees,
  getNominees,
  insertCategory,
  moveNominee,
  reorderCategories,
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

console.log(`${dry ? "Would create" : "Creating"} "${TO}" after "${from.title}" and move ${wildcards.length} nominees:`);
console.log("  " + wildcards.map((o) => o.title).join(", "));
if (dry) process.exit(0);

console.log("backup:", await backupDatabase("before-split-wildcards"));

const moved: MovedNominee[] = [];
let created = false;
// The history entry is written whatever happens, so undo always covers what was done.
try {
  await insertCategory({
    id: TO,
    title: "DGGer wildcards",
    description:
      "Your top 10 of the wildcards: swipe through them, then pick between your favourites two at a time. 10 points for your first down to 1 for your tenth; everyone's points are added up.",
    votingStyle: "points",
  });
  created = true;
  const order = (await getNominees({ includeHidden: true })).map((c) => c.id).filter((id) => id !== TO);
  order.splice(order.indexOf(FROM) + 1, 0, TO);
  await reorderCategories(order);
  for (const o of wildcards) {
    await moveNominee(FROM, o.id, TO);
    moved.push({ id: o.id, from: FROM, to: TO, position: o.position });
  }
} finally {
  if (created) {
    await record(serverActor, {
      kind: "import",
      action: "create",
      label: `Moved ${moved.length} DGGer wildcards into their own award, "DGGer wildcards" (top 10 by points)`,
      categoryId: TO,
      after: { categories: [TO], added: [], nominees: moved.length, pictures: [], emotes: [], moved },
    });
  }
}
console.log(`moved ${moved.length} of ${wildcards.length}`);
