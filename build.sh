#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
rm -rf dist
mkdir -p dist
tsc -p tsconfig.app.json
tsc -p tsconfig.worker.json
node tools/copy-public.mjs
echo "Built static site in dist/"
