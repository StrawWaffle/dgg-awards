// Puts DGGer's awards in their rounds (src/lib/rounds.ts) and caps the ranked
// ones at 3 (rinlux, 2026-11-20): "DGGer wildcards" (the wildcards, days 1–7)
// and "DGGer group stage" (Groups A–E, days 8–11, rank your top 3); the final,
// DGG Chatter of the Year, is with the main vote and also takes a top 3.
// Dates are set in the admin page's Rounds tab. Each change is a category
// update in the history.
//
//   bun scripts/set-dgger-rounds.ts [--dry-run]
import { getCategory, setCategoryFields } from "@/lib/data/driver";
import { record, serverActor } from "@/server/history";
import { DGGER } from "@/server/advance";

const dry = process.argv.includes("--dry-run");
const want: Record<string, { round: string | null; rankLimit: number | null }> = {
  [DGGER.wildcards]: { round: "DGGer wildcards", rankLimit: null },
  ...Object.fromEntries(DGGER.groups.map((id) => [id, { round: "DGGer group stage", rankLimit: 3 }])),
  [DGGER.final]: { round: null, rankLimit: 3 },
};
for (const [id, fields] of Object.entries(want)) {
  const c = await getCategory(id);
  if (!c) throw new Error(`no award "${id}": run scripts/split-dgger-groups.ts first`);
  const before = { round: c.round, rankLimit: c.rankLimit };
  if (before.round === fields.round && before.rankLimit === fields.rankLimit) continue;
  console.log(`${c.title}: round ${before.round ?? "none"} → ${fields.round ?? "none"}, rank up to ${before.rankLimit ?? "any"} → ${fields.rankLimit ?? "any"}`);
  if (dry) continue;
  await setCategoryFields(id, fields);
  await record(serverActor, { kind: "category", action: "update", label: c.title, categoryId: id, before, after: fields });
}
