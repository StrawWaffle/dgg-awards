#!/usr/bin/env bash
# Capture screenshots of an app container, or compare two captures.
#   tests/visual/run.sh capture <app-container> <name>    -> tests/visual/out/<name>/
#   tests/visual/run.sh compare <name-a> <name-b>         -> tests/visual/out/diff-<a>-<b>/
# Same network and container setup as tests/run.sh.
set -euo pipefail
cmd=${1:?capture or compare}
here=$(cd "$(dirname "$0")" && (pwd -W 2>/dev/null || pwd))
export MSYS_NO_PATHCONV=1
image=mcr.microsoft.com/playwright:v1.56.1-noble
deps="npm install --silent --no-save --prefix /tmp/pw playwright@1.56.1 pixelmatch@7 pngjs@7 >/dev/null 2>&1 && export NODE_PATH=/tmp/pw/node_modules"

case $cmd in
  capture)
    app=${2:?app container}; name=${3:?output name}
    docker exec "$app" bun scripts/seed.ts --mode voting --fake-votes 500 >/dev/null
    docker run --rm --network dgga-test -v "$here:/v" -w /v --ipc=host $image \
      sh -c "$deps && cp capture.mjs /tmp/pw/ && node /tmp/pw/capture.mjs http://$app:3000 http://dgga-mock:8789 /v/out/$name"
    ;;
  compare)
    a=${2:?}; b=${3:?}
    docker run --rm -v "$here:/v" -w /v $image \
      sh -c "$deps && cp compare.mjs /tmp/pw/ && node /tmp/pw/compare.mjs /v/out/$a /v/out/$b /v/out/diff-$a-$b"
    ;;
esac
