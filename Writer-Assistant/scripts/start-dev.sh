#!/bin/bash
cd /workspaces/First-Project-/Writer-Assistant
export VITE_CLERK_PUBLISHABLE_KEY="pk_test_ZW5hYmxpbmctcmVwdGlsZS0zMC5jbGVyay5hY2NvdW50cy5kZXYk"
export PORT=8080
export BASE_PATH=/
pnpm --filter @workspace/writer run dev
