# Agent Notes

Guidance for AI coding assistants (Claude Code, opencode, Copilot, Cursor, etc.) working in this repo.

## What this repo is

**WriteAI** — an AI-powered writing assistant web app. Users can create documents, write with AI assistance (grammar checking, rewriting, summarization, prologue generation), build fictional worlds with character/place/item profiles, track word count goals, save version snapshots, and export to PDF/DOCX.

## Repo layout

- `Writer-Assistant/` — The full application (pnpm monorepo).
  - `artifacts/writer/` — Vite + React frontend (port 8080).
  - `artifacts/api-server/` — Express 5 API backend (port 5000).
  - `artifacts/mockup-sandbox/` — UI component sandbox for previewing shadcn/ui components.
  - `lib/db/` — Drizzle ORM + PostgreSQL schema.
  - `lib/api-client-react/` — Auto-generated (Orval) React Query hooks for the API.
  - `lib/api-spec/` — OpenAPI spec and Orval config.
  - `lib/api-zod/` — Generated Zod schemas from the OpenAPI spec.
- `.devcontainer/` — Codespaces / dev container config (prebuilt Node 24 image).
- `.opencode/skills/` — opencode skill packs (frontend-design, vercel-infrastructure, c4-diagrams).
- `opencode.json` — opencode configuration (model: `opencode/deepseek-v4-flash-free`).

## How to run

All commands run from `Writer-Assistant/`:

```bash
# Push DB schema to Neon (remote PostgreSQL)
pnpm --filter @workspace/db run push

# API server (requires DATABASE_URL and OPENROUTER_API_KEY)
PORT=5000 NODE_ENV=development \
  OPENROUTER_API_KEY="<key>" pnpm --filter @workspace/api-server run dev

# Frontend dev server
PORT=8080 BASE_PATH=/ pnpm --filter @workspace/writer run dev

# Typecheck everything
pnpm run typecheck
```

### Database

The app uses **Neon (remote PostgreSQL)**. The connection string is stored in `Writer-Assistant/.env` (gitignored). The app does **not** auto-load `.env` files — you must pass `DATABASE_URL` in the command or export it:

```bash
export DATABASE_URL=$(grep DATABASE_URL Writer-Assistant/.env | cut -d= -f2-)
```

Or inline:
```bash
DATABASE_URL="postgresql://..." pnpm --filter @workspace/api-server run dev
```

Both servers must run in the background (use `nohup ... &` or `run_in_background: true`).

## Stack

- **Frontend:** React 19, Vite 7, Tailwind CSS 4, shadcn/ui, Wouter routing, TanStack React Query
- **Backend:** Express 5, esbuild (bundled ESM build)
- **Database:** PostgreSQL 16 + Drizzle ORM
- **AI:** OpenRouter with `deepseek/deepseek-v4-flash` model (OpenAI-compatible SDK)
- **Auth:** Clerk (currently bypassed for local dev — see conventions)
- **Validation:** Zod v4, drizzle-zod
- **API codegen:** Orval (from OpenAPI spec)
- **Package manager:** pnpm (workspaces)

## Conventions when editing

- **No Clerk auth in local dev.** Auth is skipped when `CLERK_SECRET_KEY` is unset (`app.ts` sets `req.auth = { userId: "dev-user" }`). Production deploys need `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` set.
- **AI uses OpenRouter.** The `OPENROUTER_API_KEY` env var is read at startup. Model is `deepseek/deepseek-v4-flash`. Image generation is disabled (not supported via OpenRouter). The OpenAI SDK is configured with `baseURL: "https://openrouter.ai/api/v1"`.
- **Editor auto-save** happens on three triggers: 800ms debounce after typing stops, Ctrl+S/Cmd+S, and every 60 seconds via interval.
- **TypeScript is strict.** Run `pnpm run typecheck` after changes. The build step typechecks before bundling.
- **Generated code lives in `lib/*/src/generated/`.** Don't hand-edit API client or Zod schema files — regenerate them via the codegen script.
- **Don't commit `.env` files or secrets.** The `.gitignore` covers standard patterns. Double-check before staging. The `Writer-Assistant/.env` file holds `DATABASE_URL` with the Neon connection string.
- **The app does not auto-load `.env`.** No dotenv dependency. Pass `DATABASE_URL` inline or export it before running commands.
- **Don't commit `node_modules`, `dist`, or `*.tsbuildinfo`.** Already covered by `.gitignore`.

## Debugging save failures

- **`guest-id.ts` monkey-patches `window.fetch`.** It always constructs a `Request` object and appends `x-guest-id` via `req.headers.append()` — do NOT manually build a `headers` plain object, as that can suppress auto-set `Content-Type` (both `application/json` and `multipart/form-data`). Without the correct Content-Type, Express won't parse the body and returns 400.
- **Check API server logs for `content-type` and body.** A save returning 400 with `content-type: text/plain` and `body: undefined` means the JSON body was lost — the `guest-id.ts` header patch is the likely culprit.
- **The OpenAPI `DocumentUpdate` schema** must not have `minLength: 1` on `title` (only `DocumentInput` for creation needs it). Otherwise an empty title string `""` fails Zod validation and blocks the entire save including content.
- **After editing `openapi.yaml`**, run `pnpm --filter @workspace/api-spec run codegen` to regenerate Zod schemas and API client, then rebuild the API server (`pnpm --filter @workspace/api-server run build`).
- **Typecheck conflicts in generated code** (e.g. duplicate `ListWorldEntitiesParams`) may require trimming `api-zod/src/index.ts` — remove `export * from "./generated/types"` if it collides with `api.ts` exports.

## When running local commands / dev servers

- **Long-running processes must run in the background.** Use `nohup ... &` or `run_in_background: true`. Verify with `curl localhost:PORT/api/healthz`.
- **Stop background processes you started before declaring a task complete**, unless the user explicitly wants them left running.
- **API server needs a rebuild after source changes.** Run `pnpm --filter @workspace/api-server run build` before restarting.

## Where things live

| What | Where |
|------|-------|
| DB schema | `Writer-Assistant/lib/db/src/schema/documents.ts` |
| API routes | `Writer-Assistant/artifacts/api-server/src/routes/` |
| API spec | `Writer-Assistant/lib/api-spec/openapi.yaml` |
| Frontend pages | `Writer-Assistant/artifacts/writer/src/pages/` |
| UI components | `Writer-Assistant/artifacts/writer/src/components/ui/` |
| AI integration | `Writer-Assistant/artifacts/api-server/src/routes/ai.ts` |
| Image upload route | `Writer-Assistant/artifacts/api-server/src/routes/upload.ts` |
| Auth setup | `Writer-Assistant/artifacts/api-server/src/app.ts` |
| Vite config (proxy) | `Writer-Assistant/artifacts/writer/vite.config.ts` |
| Error handling (multer) | `Writer-Assistant/artifacts/api-server/src/app.ts` (bottom of file) |
