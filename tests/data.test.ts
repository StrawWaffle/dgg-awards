// Checks on the nominee data and bundled media. No server needed:
//   bun test tests/data.test.ts
// Run it on Linux (e.g. in the oven/bun image): Windows ignores filename
// case, which is how mismatched emote names slipped through before.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Data } from "@/data";

const root = join(import.meta.dir, "..");
const media = new Set(readdirSync(join(root, "src/media")));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "media" ? [] : sourceFiles(p);
    return /\.(tsx?|html)$/.test(e.name) ? [p] : [];
  });
}

describe("media", () => {
  test("every nominee image exists with exact filename case", () => {
    const missing = Data.flatMap((c) =>
      c.options
        .filter((o) => o.imageId && !media.has(o.imageId))
        .map((o) => `${c.id}/${o.id}: ${o.imageId}`),
    );
    expect(missing).toEqual([]);
  });

  test("every /Media/ path in the source exists with exact filename case", () => {
    const missing: string[] = [];
    for (const file of sourceFiles(join(root, "src"))) {
      for (const [, name] of readFileSync(file, "utf8").matchAll(/\/Media\/([\w.-]+)/g)) {
        if (!media.has(name!)) missing.push(`${file.slice(root.length + 1)}: ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("nominees", () => {
  test("ids are unique within each category", () => {
    for (const c of Data) {
      const ids = c.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
