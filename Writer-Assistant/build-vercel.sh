#!/bin/bash
set -e
pnpm install --frozen-lockfile
rm -rf artifacts/api-server/dist-vercel
pnpm --filter @workspace/api-server run build
node artifacts/api-server/build-vercel.mjs
PORT=8080 BASE_PATH=/ pnpm --filter @workspace/writer run build
