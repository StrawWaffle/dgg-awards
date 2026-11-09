// Loads the nominees from src/data.ts and sets the site mode, for previews.
//
//   bun scripts/seed.ts --mode voting
//   bun scripts/seed.ts --mode reviewing --fake-votes 500
//
// Re-running replaces all categories, nominees and votes. --fake-votes adds
// that many invented voters (negative uids, ip "seed") so the results reveal
// has something to show. They are not last year's real numbers.
import { Database } from "bun:sqlite";
import { parseArgs } from "util";
import { Data } from "@/data";
import { env } from "@/lib/util";
import type { ViewingMode } from "@/lib/types";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    mode: { type: "string", default: "voting" },
    "fake-votes": { type: "string", default: "0" },
  },
  strict: true,
});

const modes: ViewingMode[] = ["locked", "voting", "idle", "reviewing"];
const mode = values.mode as ViewingMode;
if (!modes.includes(mode)) {
  console.error(`--mode must be one of ${modes.join(", ")}`);
  process.exit(1);
}
const fakeVoters = Number(values["fake-votes"]);
/** src/data.ts holds the 2025 nominees. */
const AWARD_YEAR = "2025";

const db = new Database(env("DB_FILE_NAME"));
db.run("PRAGMA foreign_keys = ON;");

// Small seeded PRNG so the same seed gives the same fake results.
let state = 2025;
const rand = () => {
  state = (state * 1103515245 + 12345) % 2 ** 31;
  return state / 2 ** 31;
};

db.transaction(() => {
  db.run("DELETE FROM votes");
  db.run("DELETE FROM options");
  db.run("DELETE FROM categories");
  db.run("DELETE FROM sessions WHERE uid < 0");
  db.run("DELETE FROM users WHERE uid < 0");

  const insCat = db.prepare(
    "INSERT INTO categories (id, title, description) VALUES (?, ?, ?)",
  );
  const insOpt = db.prepare(
    `INSERT INTO options (id, categoryId, title, description, url, imageId, videoId, renderType,
       date, linkType, clipStart, clipEnd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const c of Data) {
    insCat.run(c.id, c.title, c.description);
    for (const o of c.options) {
      insOpt.run(
        o.id,
        c.id,
        o.title,
        o.description,
        o.url,
        o.imageId,
        o.videoId,
        o.renderType ?? "default",
        o.date ?? null,
        o.linkType ?? null,
        o.clipStart ?? null,
        o.clipEnd ?? null,
      );
    }
  }

  if (fakeVoters > 0) {
    const insUser = db.prepare(
      "INSERT INTO users (uid, name, createdDate, admin) VALUES (?, ?, ?, 0)",
    );
    const insVote = db.prepare(
      "INSERT INTO votes (uid, at, categoryId, optionId, sessionSnapshot) VALUES (?, ?, ?, ?, ?)",
    );
    const now = Math.floor(Date.now() / 1000);
    // Per category, give each nominee a random weight with a long tail so
    // there is a clear winner and some close races.
    const weights = Data.map((c) =>
      c.options.map(() => Math.pow(rand(), 2.5) + 0.02),
    );
    for (let i = 1; i <= fakeVoters; i++) {
      const uid = -i;
      insUser.run(uid, `seed_voter_${i}`, new Date().toISOString());
      const snapshot = JSON.stringify({
        id: `seed-${i}`,
        uid,
        createdAt: now,
        expiresAt: now,
        ip: "seed",
        agent: "seed",
      });
      Data.forEach((c, ci) => {
        if (rand() < 0.15) return; // some voters skip a category
        const w = weights[ci]!;
        let r = rand() * w.reduce((a, b) => a + b, 0);
        const pick = w.findIndex((x) => (r -= x) < 0);
        const option = c.options[pick === -1 ? w.length - 1 : pick]!;
        insVote.run(uid, now, c.id, option.id, snapshot);
      });
    }
  }

  const start = Math.floor(Date.now() / 1000) - 86400;
  const end = start + 86400 * 60;
  const setCfg = db.prepare(
    "INSERT INTO configuration (key, val) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET val = excluded.val",
  );
  setCfg.run("startTime", String(start));
  setCfg.run("endTime", String(end));
  setCfg.run("viewingMode", mode);
  setCfg.run("awardYear", AWARD_YEAR);
})();

const count = (t: string) =>
  (db.query(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n;
console.log(
  `Seeded ${count("categories")} categories, ${count("options")} nominees, ${count("votes")} votes. Mode: ${mode}`,
);
db.close();
