import { $ } from "bun";
import bpt from "bun-plugin-tailwind";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { env } from "@/lib/util";

if (import.meta.dir.split("/").pop() !== "dgga25") {
  console.warn("This script should be run from the root of the project.");
}

const outdir = join(__dirname, "dist");
await rm(outdir, { recursive: true, force: true });

await Bun.build({
  target: "bun",
  outdir: outdir,
  entrypoints: ["src/index.tsx"],
  loader: {
    ".png": "file",
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  plugins: [bpt],
  footer: `// built at ${new Date().toLocaleString()} with dggL`,
  drop: ["console"],
});

const prod_env = await Bun.file(join(__dirname, ".env")).text();
await Bun.write(
  join(__dirname, "dist", ".env"),
  prod_env.replace(
    new RegExp(env("DB_FILE_NAME")),
    `prod_${env("DB_FILE_NAME")}`,
  ),
);

await $`bunx --bun drizzle-kit generate`;
await $`bunx --bun drizzle-kit push --config=drizzle-prod.config.ts`;
console.log(
  `\nAll done! Run index.js with Bun from inside of dist/, create an account, then run\nbun run ../scripts/make-admin.ts --username <your name> --db ./prod_${env("DB_FILE_NAME")}\n`,
);
