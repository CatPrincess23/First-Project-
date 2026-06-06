# Hackathon Starter Template

Welcome! This template gives you a fully-configured cloud dev environment in about 1-2 minutes. No installs on your laptop, no "works on my machine." You just click a few buttons in the browser and you're coding.

## Getting started

1. **Click the green "Use this template" button** at the top of this repo, then **Create a new repository**. Give it any name — this is your hackathon project repo.
2. Open the new repo you just created.
3. Click the green **`<> Code`** button → **Codespaces** tab → **Create codespace on main**.
4. Wait 1-2 minutes while it builds. You'll see a VS Code window in your browser when it's ready.
5. Start building!

> **Tip:** If you'd rather use the desktop VS Code app, install the "GitHub Codespaces" extension and connect to your codespace from there.

## What's pre-installed

| Tool | What it's for |
| --- | --- |
| Node.js 24 (LTS) | JavaScript / TypeScript runtime |
| Python 3.12 | Python projects |
| GitHub CLI (`gh`) | Talk to GitHub from the terminal |
| opencode | AI coding assistant in your terminal |
| Vercel CLI | Deploy frontends and serverless apps |
| Netlify CLI | Deploy static sites and functions |
| Wrangler | Deploy to Cloudflare Workers / Pages |
| Railway CLI | Deploy full-stack apps with databases |
| Neon CLI (`neonctl`) | Spin up serverless Postgres databases |
| `uv` | Fast Python package + project manager (also installs other Python versions on demand) |
| `httpie`, `jq`, `ripgrep`, `fd`, `tmux`, `tree` | Handy command-line utilities |
| opencode VS Code extension | Launch opencode in the editor's integrated terminal |
| Prettier, ESLint, Pylance, Tailwind extensions | Auto-formatting and language support in VS Code |
| Markdown All in One | Better markdown editing and preview |
| DotENV | Syntax highlighting for `.env` files |

Format-on-save is already turned on — your code gets tidied every time you hit save.

## Using opencode (terminal AI assistant)

opencode is an AI coding agent that lives in your terminal. Open a terminal in VS Code (`` Ctrl+` ``) and run:

```bash
opencode
```

**It just works out of the box.** This template ships an `opencode.json` that defaults to `opencode/deepseek-v4-flash-free` — a free model served through opencode's hosted gateway, no API key needed. Start chatting immediately.

The template also ships a few **skills** opencode auto-loads when relevant — including building good-looking UIs, deploying to Vercel without the usual env-var/domain footguns, and drawing architecture diagrams from your code. You don't have to invoke them; just describe what you want and opencode will pull in the right context.

### Want a different / more powerful model?

If your project gets serious and you want to switch to a paid model (Claude, GPT-4, DeepSeek V4 Pro, etc.), you have a few options:

**Use a shared org API key (if organizers set one up):** organizers can pre-provision an API key as an env var — opencode will pick it up automatically. Edit `opencode.json` to point at the model you want and the corresponding provider (e.g. `"model": "anthropic/claude-sonnet-4-5"`).

**Bring your own key:**
```bash
export ANTHROPIC_API_KEY=sk-ant-...   # or OPENAI_API_KEY, etc.
```
Then edit `opencode.json`'s `"model"` field. To persist across terminal sessions, add it as a [Codespaces user secret](https://github.com/settings/codespaces).

**Use a Claude or ChatGPT subscription:**
```bash
opencode auth login
```
Follow the browser prompt. This uses your subscription instead of pay-per-token API credits.

## Where to deploy your project

| Project type | Recommended host |
| --- | --- |
| Static site (HTML, plain React, Astro) | **Cloudflare Pages** (`wrangler pages deploy`) |
| Frontend with API routes (Next.js, SvelteKit, Remix) | **Vercel** (`vercel`) or **Netlify** (`netlify deploy`) |
| Full-stack app needing a database | **Railway** (`railway up`) — runs app + Postgres together |
| Anything with a Dockerfile | **Railway** (`railway up`) |
| Need just a Postgres database for your app | **Neon** (`neonctl projects create`) — pairs well with a Vercel/Netlify frontend |

These CLIs are pre-installed. Each one walks you through login the first time you run it.

## Sharing a preview URL during the hack

Need to show your in-progress app to a teammate or judge?

1. Run your dev server (e.g. `npm run dev`).
2. In VS Code, open the **Ports** tab (bottom panel, next to Terminal).
3. Find your port (3000, 5173, 8000, or 8080 — they're forwarded by default).
4. **Right-click** the port → **Port Visibility** → **Public**.
5. Copy the URL from the **Forwarded Address** column and share it.

> The URL stops working when your codespace stops. Deploy to one of the hosts above for anything you want to keep alive.

## Codespaces free-tier limits — important!

GitHub gives each personal account a monthly Codespaces quota:

- **Free plan:** 120 core-hours + 15 GB storage / month
- **Pro / Student plan:** 180 core-hours + 20 GB storage / month

A 2-core codespace burns 2 core-hours per real hour of use. A weekend hackathon won't blow through the hours — but storage is the silent killer.

### **Delete your codespace after the event** (don't just stop it)

A *stopped* codespace still eats your 15 GB storage quota. To actually free it up:

1. Go to <https://github.com/codespaces>.
2. Click the **`...`** menu next to your codespace.
3. Click **Delete**.

Push your code to GitHub first if you want to keep it!

## Stuck?

Most issues during the event will be auth-related — your AI tool or deploy CLI asking for credentials. Re-read the opencode section above, or ask an organizer. Happy hacking!
