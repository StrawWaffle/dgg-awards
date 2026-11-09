import { Database } from "bun:sqlite";
import { parseArgs } from "util";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    db: {
      type: "string",
    },
    username: {
      type: "string",
    },
  },
  strict: true,
  allowPositionals: false,
});

if (!values.db) {
  console.error(
    "Specify which database you're interacting with with --db <filename>",
  );
  process.exit(0);
}
if (!values.username) {
  console.error(
    "Specify which user you're making an admin with --username <username>",
  );
  process.exit(0);
}

const database = new Database(values.db!);
console.log(`Making ${values.username} an admin in ${values.db}`);
try {
  const changes = database
    .query(`UPDATE users SET admin = ?1 WHERE name = ?2;`)
    .run(1, values.username);
  console.log(
    `Done. ${changes.changes} rows changed. ->${changes.lastInsertRowid}`,
  );
  database.close();
} catch (e) {
  console.error(e);
}
