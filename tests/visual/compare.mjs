// Pixel-compare two screenshot folders from capture.mjs.
//   node compare.mjs <before-dir> <after-dir> <diff-dir>
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const [A, B, OUT] = process.argv.slice(2);
await mkdir(OUT, { recursive: true });
let failed = 0;

for (const name of (await readdir(A)).filter((f) => f.endsWith(".png")).sort()) {
  let b;
  try {
    b = PNG.sync.read(await readFile(`${B}/${name}`));
  } catch {
    console.log(`MISSING  ${name}`);
    failed++;
    continue;
  }
  const a = PNG.sync.read(await readFile(`${A}/${name}`));
  if (a.width !== b.width || a.height !== b.height) {
    console.log(`SIZE     ${name}  ${a.width}x${a.height} -> ${b.width}x${b.height}`);
    failed++;
    continue;
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  const pct = ((n / (a.width * a.height)) * 100).toFixed(3);
  if (n > 0) {
    await writeFile(`${OUT}/${name}`, PNG.sync.write(diff));
    failed++;
  }
  console.log(`${n === 0 ? "SAME   " : "DIFF   "}  ${name}  ${n} px (${pct}%)`);
}
process.exit(failed ? 1 : 0);
