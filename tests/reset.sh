#!/usr/bin/env bash
# Put an app container's database back to the same starting state: no users,
# sessions or votes, then last year's nominees with 500 fake voters, in voting
# mode. Used by tests/run.sh and tests/visual/run.sh so every run starts equal.
set -euo pipefail
app=${1:?app container}
export MSYS_NO_PATHCONV=1
docker exec "$app" bun -e '
  const d = new (require("bun:sqlite").Database)(process.env.DB_FILE_NAME);
  d.run("DELETE FROM votes"); d.run("DELETE FROM sessions"); d.run("DELETE FROM users");'
docker exec "$app" bun scripts/seed.ts --mode voting --fake-votes 500 >/dev/null
