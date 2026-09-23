# Whimsical Writer

Whimsical Writer is a manuscript editor with AI writing assistance, chapters, world-building profiles, version history, and PDF/DOCX export. The React/Vite frontend and Express API are in `Writer-Assistant/`; the API uses PostgreSQL through Drizzle ORM.

## Local development

Use Node.js 24 and pnpm 11. Copy `.env.example` to `Writer-Assistant/.env`, then configure a PostgreSQL `DATABASE_URL`, a stable `GUEST_ID_SECRET`, and an AI provider key. Clerk keys are optional; without them, the app uses signed guest sessions.

```sh
cd Writer-Assistant
set -a; . ./.env; set +a
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run dev
```

In another terminal, start the frontend:

```sh
cd Writer-Assistant
PORT=8080 BASE_PATH=/ pnpm --filter @workspace/writer run dev
```

See [AGENTS.md](AGENTS.md) for the repository layout, environment variables, and deployment notes. The production build is `pnpm run build:vercel` from `Writer-Assistant/`.
