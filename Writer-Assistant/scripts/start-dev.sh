#!/bin/bash
# Starts the frontend dev server.
# Secrets are sourced from Writer-Assistant/.env (gitignored) — never hardcoded.
cd /workspaces/First-Project-/Writer-Assistant

# Load VITE_/server env vars from the local .env if present, without overriding
# anything already exported in the shell.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# VITE_CLERK_PUBLISHABLE_KEY is optional — if unset, the app runs in guest-only
# mode (no sign-in UI). Do NOT hardcode a publishable key here; set it in .env.
export PORT=${PORT:-8080}
export BASE_PATH=${BASE_PATH:-/}
pnpm --filter @workspace/writer run dev
