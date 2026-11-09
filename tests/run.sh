#!/usr/bin/env bash
# Reseed an app container and run the API tests against it.
#   tests/run.sh <app-container> [extra bun test args]
# Expects the container and dgga-mock on the docker network dgga-test, with
# ADMIN_USERNAMES=Tester and the dev-client/dev-secret stand-in credentials.
set -euo pipefail
app=${1:?app container name}
shift
here=$(cd "$(dirname "$0")/.." && (pwd -W 2>/dev/null || pwd))
export MSYS_NO_PATHCONV=1
docker exec "$app" bun scripts/seed.ts --mode voting --fake-votes 500 >/dev/null
docker run --rm --network dgga-test -v "$here:/w" -w /w \
  -e BASE_URL="http://$app:3000" -e MOCK_URL=http://dgga-mock:8789 \
  oven/bun:1.3 bun test tests/api.test.ts "$@"
