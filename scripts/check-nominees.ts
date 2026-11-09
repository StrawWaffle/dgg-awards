// Score the nominee data in src/data.ts with the checks in
// src/lib/nominee-checks.ts.
//   bun scripts/check-nominees.ts [--year 2025] [--summary]
// Exits 1 when there are errors, so it can gate a release.
import { parseArgs } from "util";
import { Data } from "@/data";
import { type Issue, checkAwards } from "@/lib/nominee-checks";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    year: { type: "string", default: "2025" },
    summary: { type: "boolean", default: false },
  },
  strict: true,
});

const issues = checkAwards(Data, Number(values.year));
const nominees = Data.reduce((n, c) => n + c.options.length, 0);
const errors = issues.filter((i) => i.severity === "error");
const clean = new Set(Data.flatMap((c) => c.options.map((o) => `${c.id}/${o.id}`)));
for (const i of issues) clean.delete(`${i.categoryId}/${i.nomineeId}`);

console.log(
  `${nominees} nominees in ${Data.length} categories: ${clean.size} with no issues, ` +
    `${errors.length} errors, ${issues.length - errors.length} warnings.\n`,
);

const byCode = new Map<string, Issue[]>();
for (const i of issues) byCode.set(i.code, [...(byCode.get(i.code) ?? []), i]);
for (const [code, list] of [...byCode].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(list.length).padStart(4)}  ${list[0]!.severity.padEnd(7)}  ${code}`);
}

if (!values.summary) {
  for (const category of Data) {
    const mine = issues.filter((i) => i.categoryId === category.id);
    if (mine.length === 0) continue;
    console.log(`\n${category.title}`);
    for (const o of category.options) {
      for (const i of mine.filter((m) => m.nomineeId === o.id)) {
        console.log(`  ${i.severity === "error" ? "✗" : "!"} ${o.title}: ${i.message}`);
      }
    }
  }
}

process.exit(errors.length ? 1 : 0);
