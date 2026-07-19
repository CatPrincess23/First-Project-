# Agent Notes

Guidance for AI coding assistants (Claude Code, opencode, Copilot, Cursor, etc.) working in this repo.

## What this repo is

**Whimsical Writer** — an AI-powered writing assistant web app. Users can create documents, write with AI assistance (grammar checking, rewriting, summarization, prologue generation, persistent chat conversations), build fictional worlds with character/place/item profiles, track word count goals, save version snapshots, and export to PDF/DOCX.

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
  DATABASE_URL="postgresql://..." \
  OPENROUTER_API_KEY="<key>" pnpm --filter @workspace/api-server run dev

# Or load both from .env:
export $(grep -v '^#' Writer-Assistant/.env | xargs) && \
  PORT=5000 NODE_ENV=development pnpm --filter @workspace/api-server run dev

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

For convenience, you can export both env vars from `.env`:
```bash
export $(grep -v '^#' Writer-Assistant/.env | xargs) && PORT=5000 NODE_ENV=development pnpm --filter @workspace/api-server run dev
```

Both servers must run in the background (use `nohup ... &`, `run_in_background: true`, or `tmux new-session -d -s <name> '<command>'`). The `tmux` approach is more reliable in shell environments where nohup'd children get killed when the parent shell exits.

## Stack

- **Frontend:** React 19, Vite 7, Tailwind CSS 4, shadcn/ui, Wouter routing, TanStack React Query
- **Backend:** Express 5, esbuild (bundled ESM build)
- **Database:** PostgreSQL 16 + Drizzle ORM
- **AI:** OpenRouter with `deepseek/deepseek-v4-flash` (free) — OpenAI-compatible SDK (`baseURL: "https://openrouter.ai/api/v1"`)
- **Auth:** Clerk (currently bypassed for local dev — see conventions)
- **Validation:** Zod v4, drizzle-zod
- **API codegen:** Orval (from OpenAPI spec)
- **Package manager:** pnpm (workspaces)

## Conventions when editing

- **Sign-in is opt-in; guest mode is the default.** `/sign-in` and `/sign-up` host Clerk `<SignIn>`/`<SignUp>` (`App.tsx`), gated on `VITE_CLERK_PUBLISHABLE_KEY`. A "Continue as guest" link is always available, and when no publishable key is configured the auth pages show a guest-only CTA instead of an empty Clerk form. Guests are identified by a random UUID stored in `localStorage` and sent as the `x-guest-id` header; guest documents persist as long as the browser/localStorage isn't cleared.
- **Identity never returns 401.** The `requireIdentity` middleware in `identity.ts` always passes. If no explicit identity is found (Clerk, guest cookie, or `x-guest-id` header), a fallback is generated from the request IP. This prevents the "could not load documents" error on any deployment.
- **`wa_guest` signed cookie is the primary guest identity; `x-guest-id` is the fallback.** `resolveIdentity` (`identity.ts`) prefers the server-signed `wa_guest` cookie (HMAC-verified — survives localStorage clears), then the `x-guest-id` header (from `localStorage` via `guest-id.ts`, validated as a UUID), then a fresh server-generated UUID. The frontend `guest-id.ts` generates a UUID on first visit, stores it in `localStorage`, and appends `x-guest-id` to every `/api/` request; the server also issues the signed `wa_guest` cookie for that UUID so identity survives JS crashes. No `POST /api/auth/guest` call is needed.
- **Clerk auth is optional and auto-detects.** `app.ts` mounts `clerkMiddleware` only when `CLERK_SECRET_KEY` is set; otherwise it runs guest-only and **logs a warning in production instead of throwing** (so unconfigured deploys keep serving). Resolution order: Clerk user → signed `wa_guest` cookie → `x-guest-id` header → random UUID. `getUserId()` fails closed to `anon:<ip>` if identity is somehow missing. NOTE: the Clerk instance itself (`enabling-reptile-30`) must have at least one sign-in factor enabled (Email/Password, OAuth) in the Clerk dashboard — otherwise `<SignIn>` renders an empty form. The local `.env` has no `CLERK_SECRET_KEY`, so local dev is guest-only.
- **AI provider priority (top wins):** `GROQ_API_KEY` → `GROK_API_KEY` → `DEEPSEEK_API_KEY` → `GEMINI_API_KEY` → `OPENROUTER_API_KEY` (default). Groq routes to `https://api.groq.com/openai/v1` with model `llama-3.3-70b-versatile`. Grok/xAI routes to `https://api.x.ai/v1` with model `grok-2`. The OpenAI SDK is configured with `baseURL` set per-provider. The current `.env` has a working `GROQ_API_KEY` (free tier, 100K tokens/day limit) and an expired `OPENROUTER_API_KEY` (returns 401).
- **Groq free tier has a 100K tokens/day limit.** Heavy use of grammar/chat/suggest can exhaust this within a day. When the limit is hit, the AI provider returns 429 and the routes surface it as HTTP 429 with a friendly message. To remove the limit, upgrade to Groq Dev Tier at https://console.groq.com/settings/billing (pay-per-token) or switch to another provider by removing `GROQ_API_KEY` from Vercel env. 
- **AI provider key currently active: Groq.** The `GROQ_API_KEY` in `.env` and Vercel works for all AI features. The `OPENROUTER_API_KEY` is expired (returns 401) — it's only used as a last-resort fallback if no other provider key is set.
- **All guests get unlimited AI (no paywall).** In `pro-context.tsx`, `isPro` is hardcoded to `useState(true)`, so `useRequest()` always returns `true`. The rate-limit code (3 requests → upgrade modal) is present but inactive. Can be enabled later when sign-in and payment are implemented.
- **AI chat sends full document context.** On every chat message, the frontend (`editor.tsx`) embeds the full editor content in a system message. The backend (`ai.ts`) merges that system message with the base system prompt into a **single unified system message** before calling the AI, so the model sees the document as part of its instructions. `max_tokens` is 1500 for the chat endpoint (same as other AI endpoints). Document context is capped at `DOC_CONTEXT_CAP = 30000` characters to stay within the model's context window.
- **AI endpoints cap input size to avoid 500s.** The `/suggest`, `/grammar`, and `/chat` endpoints slice incoming text before sending it to the model: suggest caps at 8K chars (12K for `shorten`), grammar caps at 20K chars (`GRAMMAR_CAP`), and chat's document context is capped at 30K. Without these caps, large documents blow past the model's context window and the AI provider returns an error that surfaces as a 500. Summary and prologue already cap at 6K–8K.
- **AI rate-limit errors return 429.** All AI route handlers (`/suggest`, `/grammar`, `/chat`) are wrapped in try/catch. When the underlying provider throws a 429 (e.g. Groq's free tier limit of 100K tokens/day), the route returns HTTP 429 with `{ error: "AI rate limit reached. Please try again later." }` instead of a generic 500. The frontend (`editor.tsx`) shows a friendlier toast for 429s ("AI rate limit reached — please try again in a few minutes") versus other failures.
- **Editor uses TipTap rich text editor** (`editor.tsx` + `rich-text-editor.tsx`) with full WYSIWYG formatting toolbar (bold, italic, underline, strikethrough, font family/size/color, headings, lists, alignment, link, image). Content is stored as HTML in the database. Before sending to AI APIs, HTML is stripped via `stripHtml()` to get plain text.
- **Editor auto-save** triggers on: 500ms debounce after typing stops (ref-based, in `RichTextEditor.onChange`), Save button click, Ctrl+S/Cmd+S, blur (save-on-blur), and a 60-second backup interval. Title also auto-saves with a 500ms debounce. A "Saved"/"Saving..." indicator shows in the toolbar.
- **Title auto-save** debounces 500ms after the last keystroke and saves title+content together.  
- **Grammar check uses AI correction + local LCS diff.** The `POST /api/ai/grammar` endpoint asks the model to return ONLY the corrected text (no JSON, no offset data — the model is unreliable at computing character positions). The system prompt is detailed (6 error categories: spelling, grammar, punctuation, capitalization, word choice, sentence structure) and temperature is 0.1 to avoid overly conservative output. The backend then runs a local `wordDiff()` function that tokenizes both texts into words, computes a **Longest Common Subsequence (LCS)** table to find edit operations, and maps each diff block to an `errors[]` entry with `message`, `suggestion`, `offset`, `length`, and `type` fields. Error type is determined by `classifyError()` using Levenshtein distance (dist ≤ 2 = spelling, multi-word = style, else grammar). This avoids fragile JSON parsing and accurately handles insertions, deletions, and substitutions.
- **Image generation uses procedural SVG fallback.** The `POST /api/ai/image` endpoint first tries OpenRouter image models. When they fail (invalid API key), it falls back to a procedural SVG generator (`generateProceduralSvg()` in `ai.ts`) that creates themed scenes (fantasy, ocean, forest, desert, space, mountains, city, night) with gradient skies, stars, moon/sun, mountains, trees, water, particles — all deterministic from the prompt text hash. No API key needed for the fallback.
- **Uploaded images stored as base64 data URLs.** The `POST /api/upload` route (`upload.ts`) uses multer `memoryStorage()` and converts uploaded files to base64 data URLs instead of saving to disk. This works on Vercel's ephemeral filesystem. The data URL is stored directly in the `world_entities.image_url` column.
- **Favicon is a purple gradient "W" with gold stars.** `public/favicon.svg` is a 180×180 SVG with a purple gradient background, white serif "W", and gold sparkle stars. The same SVG is used as the sidebar logo image (`<img src="/favicon.svg">`) and in the hero banner on the home dashboard — replaces the old styled-text "W" div.
- **Entity scanning finds characters/places/things in a document.** The `POST /api/ai/scan-entities` endpoint accepts `{ type: "person"|"animal"|"place"|"thing", documentContent }` and uses the AI to extract all entities of that type. Returns `{ entities: [{ name, description, details }] }`. This endpoint is NOT in the OpenAPI spec — it's called directly via fetch from the frontend.
- **TypeScript is strict.** Run `pnpm run typecheck` after changes. The build step typechecks before bundling.
- **Home dashboard is the default view.** `documents.tsx` has a new `"home"` view (default) showing a purple gradient hero with the favicon "W", stats cards (documents, words count, AI requests), quick-access cards linking World Building / AI Tools / Stats, and recent documents. The sidebar nav includes a "Home" item as the first entry.
- **Generated code lives in `lib/*/src/generated/`.** Don't hand-edit API client or Zod schema files — regenerate them via the codegen script.
- **Don't commit `.env` files or secrets.** The `.gitignore` covers standard patterns. Double-check before staging. The `Writer-Assistant/.env` file holds `DATABASE_URL` with the Neon connection string.
- **The app does not auto-load `.env`.** No dotenv dependency. Pass `DATABASE_URL` inline or export it before running commands.
- **Guest cookie signing needs a persistent GUEST_ID_SECRET.** In the identity middleware (`identity.ts`), guest IDs are signed with HMAC-SHA256. If `GUEST_ID_SECRET` is not set, a random one is generated per server start, invalidating all existing guest cookies. On Vercel, set it via `vercel env add GUEST_ID_SECRET production`. For local dev, add it to `.env`.
- **Don't commit `node_modules`, `dist`, or `*.tsbuildinfo`.** Already covered by `.gitignore`.
- **Clerk connects directly from the browser (no proxy).** Neither the frontend (`ClerkProvider` in `main.tsx`, no `proxyUrl`) nor the backend proxy Clerk traffic, because `http-proxy-middleware` doesn't work inside Vercel serverless functions. The old `clerkProxyMiddleware` (and its `app.ts` mount + `/api/__clerk` vite proxy entry) has been removed. `ClerkProvider` is only wrapped when `VITE_CLERK_PUBLISHABLE_KEY` is present — it throws on an empty key, so guest-only deploys render `<App/>` without it.
- **No Clerk loading spinner on pages.** The 8-second Clerk loading timeout was removed from `documents.tsx`, `editor.tsx`, and `world.tsx`. Pages render immediately without waiting for Clerk to initialize. Clerk UI features (UserButton) are shown/hidden via `clerkEnabled` flag when they become available.
- **Dark mode uses CSS variables in `:root` / `.dark` blocks** in `index.css`. The `.dark` block directly overrides both raw HSL variables (`--foreground`, etc.) AND the Tailwind theme variables (`--color-foreground`, etc.) to avoid CSS cascade/specificity issues with `@theme inline`. All foreground/background colors are theme-aware. Hardcoded text colors (e.g. `text-gray-900`, `text-red-600`) must have `dark:text-*` counterparts. Pages that were missing dark variants: `not-found.tsx` (invisible text in dark mode), `editor.tsx` (grammar error badges), `documents.tsx` (crown icon), `toast.tsx` (destructive close button).
- **Undo/Redo buttons live only in the rich text editor toolbar** (`rich-text-editor.tsx`), not in the editor page header. The header's Undo2/Redo2 buttons were removed to avoid duplication. Keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z) still work via the undo/redo logic in `editor.tsx`.
- **Tour button is in the dashboard sidebar** — a `HelpCircle` icon next to the theme toggle in `documents.tsx`. Clicking it clears the `wa-tour-seen-documents` localStorage flag and remounts the `OnboardingTour` component with a fresh key, letting users rewatch the dashboard tour. The component auto-shows on first visit.
- **Word count strips HTML and decodes entities on both server and client.** The server's `countWords()` in `api-server/src/routes/documents.ts` calls `decodeEntities()` then strips HTML tags before counting, matching the client-side `stripHtml()` in `editor.tsx`. Entities like `&nbsp;`, `&amp;`, `&#39;`, etc. are decoded so they don't inflate the count (matching Google Docs behavior). Word counts are **recalculated from content on every API request** rather than relying on potentially stale DB values.
- **Selected word count shown when text is highlighted.** The `RichTextEditor` component (`rich-text-editor.tsx`) listens for `selectionchange` on the document. When text is selected in the editor, the toolbar shows the selected word count instead of the total. When selection is cleared (clicking anywhere, pressing Escape), it reverts to the total count.
- **Version snapshots can be deleted.** Each version card in the Version History sidebar (`editor.tsx`) has a trash icon that calls `DELETE /api/documents/:id/versions/:versionId` (added in `documents.ts`). Confirms before deleting.
- **File import creates documents from uploaded files.** The sidebar's "Import File" button (`documents.tsx`) sends `.txt`/`.docx` files to `POST /api/import-document`, which extracts text on the server and creates a new document. The proxy config in `vite.config.ts` must include `/api/import-document` for local dev. PDF import was removed because `pdf-parse` crashes at startup on Vercel (DOMMatrix not available in Node.js).
- **Production URL:** https://whimsicalwriter.vercel.app
- **Mobile responsiveness:** The app uses Tailwind breakpoints (`sm: 640px`, `md: 768px`). Key mobile adaptations:
  - Dashboard sidebar becomes a slide-out Sheet (left drawer) triggered by a hamburger button
  - Editor AI sidebar becomes a slide-in Sheet (right drawer) triggered by a Sparkles button in the header
  - Editor toolbar scrolls horizontally instead of wrapping
  - Formatting toolbar is sticky (`sticky top-0 z-10 bg-background border-b` in `rich-text-editor.tsx`) so it stays pinned below the top header when scrolling
  - Non-essential header buttons (Goal, Version, World, Export, Save button) hidden on mobile
  - Pinch-zoom is enabled (`maximum-scale` removed from viewport meta)
  - Mobile breakpoint is 768px via `useIsMobile()` hook in `hooks/use-mobile.tsx`
  - Mobile Sheets (editor AI sidebar, dashboard sidebar) show their X close button — removed `[&>button]:hidden` so users can dismiss without relying on overlay tap (`editor.tsx`, `documents.tsx`)
  - World page entity cards show edit/delete buttons on mobile (no hover) using `md:opacity-0 md:group-hover:opacity-100` (`world.tsx`)
  - World page TabsList scrolls horizontally on narrow screens with `overflow-x-auto flex-nowrap` (`world.tsx`)
- **INP (Interaction to Next Paint) fixes for the editor:**
  - `ed.getHTML()` runs inside `requestAnimationFrame` (cancelled on unmount), not synchronously inside `onUpdate` — prevents blocking the ProseMirror input pipeline on every keystroke (`rich-text-editor.tsx`)
  - `RichTextEditor` is wrapped in `React.memo` with a comparator that skips `content` prop changes (TipTap only uses it as initial value), preventing unnecessary re-renders from parent state updates (`rich-text-editor.tsx`)
  - Callbacks passed to `RichTextEditor` (`onChange`, `onBlur`, `onSelectionChange`) use ref-backed stable references (`useCallback` + `useRef`) so they don't break `React.memo`'s equality check (`editor.tsx`)
  - `decodeEntities` uses a single regex pass with an entity map instead of 11+ chained `.replace()` calls (`editor.tsx`)
  - `wordCount` uses `useDeferredValue(content)` so `stripHtml()` doesn't block the main thread — React can interrupt it when a new keystroke arrives (`editor.tsx`)
  - `contain: layout paint style` applied to editor scroll area, desktop/mobile AI sidebar panels, chat messages container, and version history container — isolates each panel's layout so the browser doesn't recalculate the whole page on inner changes (`editor.tsx`)
  - Grammar error snippets pre-computed in a `useMemo` keyed on `grammarErrors` + `content` instead of calling `stripHtml()` on every render for every error — eliminates redundant O(n) HTML parses (`editor.tsx`)
  - `content-visibility: auto` on version history items so the browser skips rendering off-screen snapshots (`editor.tsx`)

## Debugging Vercel deployment issues

- **`api/index.mjs` must NOT be gitignored.** Vercel scans for serverless functions before the build step. If `api/index.mjs` is in `.gitignore`, Vercel can't detect it and all `/api/*` requests fall through to the SPA catch-all (returning HTML). The file at `api/` must be tracked by git — it's the esbuild-bundled Vercel entry point (`build-vercel.mjs` builds it from `src/vercel.ts`). Rebuild locally after API source changes: `cd Writer-Assistant && node artifacts/api-server/build-vercel.mjs && cp artifacts/api-server/dist-vercel/vercel.mjs ../api/index.mjs`, then commit the updated `api/index.mjs`.
- **`api/index.js` vs `api/index.mjs` conflict causes 404s on all API routes.** If both files exist, Vercel drops both serverless functions. Delete one of them to resolve.
- **Check Vercel deploy logs** for build errors: `vercel inspect <deployment-url> --logs`.
- **Check Vercel runtime logs:** `vercel logs --environment production --limit 20 --expand`.
- **List deployments:** `vercel list --environment production`.

## Debugging save failures

- **`guest-id.ts` monkey-patches `window.fetch`.** It generates a UUID on first visit, stores it in `localStorage`, and appends it as `x-guest-id` on every `/api/` request. The Request is always constructed via `new Request()` so auto-set `Content-Type` (application/json and multipart/form-data) is preserved. Do NOT manually build a `headers` plain object, as that can suppress auto-set Content-Type — without the correct Content-Type, Express won't parse the body and returns 400.
- **Check API server logs for `content-type` and body.** A save returning 400 with `content-type: text/plain` and `body: undefined` means the JSON body was lost — the `guest-id.ts` header patch is the likely culprit.
- **The OpenAPI `DocumentUpdate` schema** must not have `minLength: 1` on `title` (only `DocumentInput` for creation needs it). Otherwise an empty title string `""` fails Zod validation and blocks the entire save including content.
- **AI chat conversations are persisted to the database.** The `POST /api/ai/chat` endpoint accepts an optional `conversationId`. When provided, user and assistant messages are saved to the `messages` table and the conversation title is auto-generated from the first user message. The frontend chat panel in `editor.tsx` includes a conversation selector, new/delete buttons, and loads message history when switching conversations.
- **After editing `openapi.yaml`**, run `pnpm --filter @workspace/api-spec run codegen` to regenerate Zod schemas and API client, then rebuild the API server (`pnpm --filter @workspace/api-server run build`).
- **Typecheck conflicts in generated code** (e.g. duplicate `ListWorldEntitiesParams`) may require trimming `api-zod/src/index.ts` — remove `export * from "./generated/types"` if it collides with `api.ts` exports.

## When running local commands / dev servers

- **Long-running processes must run in the background.** Use `nohup ... &` or `run_in_background: true`. Verify with `curl localhost:PORT/api/healthz`.
- **Sleep a few seconds** after starting a background server before checking it. The `tmux` approach (`tmux new-session -d -s <name> '<command>'`) is more reliable in shell environments where nohup'd children get killed when the parent shell exits.
- **Stop background processes you started before declaring a task complete**, unless the user explicitly wants them left running.
- **API server needs a rebuild after source changes.** Run `pnpm --filter @workspace/api-server run build` before restarting.
- **Vite proxy config must list every API path prefix.** The `server.proxy` block in `artifacts/writer/vite.config.ts` only forwards requests matching listed prefixes (e.g. `/api/documents`, `/api/conversations`). Adding a new API route without adding its prefix to the proxy will cause silent failures (browser gets HTML instead of JSON).

## Where things live

| What | Where |
|------|-------|
| DB schema | `Writer-Assistant/lib/db/src/schema/documents.ts` |
| DB schema (conversations) | `Writer-Assistant/lib/db/src/schema/conversations.ts` |
| DB schema (messages) | `Writer-Assistant/lib/db/src/schema/messages.ts` |
| API routes | `Writer-Assistant/artifacts/api-server/src/routes/` |
| API spec | `Writer-Assistant/lib/api-spec/openapi.yaml` |
| Frontend pages | `Writer-Assistant/artifacts/writer/src/pages/` |
| UI components | `Writer-Assistant/artifacts/writer/src/components/ui/` |
| AI integration | `Writer-Assistant/artifacts/api-server/src/routes/ai.ts` |
| AI chat (frontend) | `Writer-Assistant/artifacts/writer/src/pages/editor.tsx` (handles conversation CRUD, document context injection, chat UI) |
| AI image generation (editor sidebar) | `Writer-Assistant/artifacts/writer/src/pages/editor.tsx` (entity scanner + SVG generation UI) |
| Image upload route | `Writer-Assistant/artifacts/api-server/src/routes/upload.ts` |
| Rich text editor | `Writer-Assistant/artifacts/writer/src/components/rich-text-editor.tsx` |
| Guest ID setup (fetch monkey-patch) | `Writer-Assistant/artifacts/writer/src/lib/guest-id.ts` |
| Clerk provider / proxy config | `Writer-Assistant/artifacts/writer/src/main.tsx` |
| Auth setup | `Writer-Assistant/artifacts/api-server/src/app.ts` |
| Vite config (proxy) | `Writer-Assistant/artifacts/writer/vite.config.ts` |
| Error handling (multer) | `Writer-Assistant/artifacts/api-server/src/app.ts` (bottom of file) |
