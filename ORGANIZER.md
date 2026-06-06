# Organizer Guide

This doc is for **you**, the event organizer — not for attendees. Covers turning this repo into a template, provisioning shared API keys, cost math, and a pre-event checklist.

## 0. About the prebuilt devcontainer image

Codespaces created from this template pull a **prebuilt image** from `ghcr.io/zainrizvi/hackathon-template-env:latest` instead of running a multi-minute `apt-get` + `npm install` dance on each Codespace start. Cold start drops from ~5 min to roughly 1-2 minutes (most of which is now image pull + VS Code server startup, not package installs).

The image is built by `.github/workflows/build-devcontainer-image.yml` from `.devcontainer/Dockerfile` on every push to `main` that touches either of those files.

### ⚠️ Check that the image is publicly pullable

After the first workflow run, **verify** that the image can be pulled without auth:

```bash
docker pull ghcr.io/<owner>/hackathon-template-env:latest
```

If you get a `denied` / `manifest not found` error, the package was published as private (the default for GHCR packages owned by orgs, sometimes for users too — behavior varies). Flip it to public:

1. Go to `https://github.com/users/<your-username>/packages/container/hackathon-template-env/settings` (or your org equivalent at `/orgs/<org>/packages/...`).
2. Scroll to **Danger Zone** -> **Change visibility** -> **Public** -> confirm.

This is a one-time step. Future pushes keep the visibility setting.

### Forking this template to a different org

If you fork to a different owner, do all of the following in order:

1. Update the `FROM` line in `.devcontainer/Dockerfile.local` to point at `ghcr.io/<your-owner>/hackathon-template-env:latest`.
2. Update the `Published to:` comment in `.devcontainer/Dockerfile` (the workflow uses `${{ github.repository_owner }}` so the workflow itself needs no edits; the doc comment is just for humans).
3. Trigger one workflow run manually (Actions -> "Build & publish devcontainer image" -> "Run workflow") so the image exists.
4. **Flip the package to public per the section above.** This is the actual gating step for attendees -- skipping it is the most likely cause of "my Codespace won't start" on day one.
5. Confirm by pulling the image from an unauthenticated terminal: `docker pull ghcr.io/<owner>/hackathon-template-env:latest`.

## 1. Mark this repo as a GitHub template

Once: attendees can't "Use this template" until you flip this switch.

**Via web UI:**
Settings → General → scroll to **Template repository** → tick the box.

**Via CLI:**
```bash
gh repo edit <owner>/<repo> --template
```

Verify with `gh repo view <owner>/<repo> --json isTemplate`.

## 2. (Optional) Pre-provision a shared AI API key

The template ships with `opencode.json` defaulting to `opencode/deepseek-v4-flash-free` — a free model served through opencode's hosted gateway, no key required. **For most events you don't need to provision anything.** Attendees run `opencode`, it works.

You may still want a shared paid key if your event needs higher-end model quality (Claude Sonnet, GPT-4, etc.) — e.g. a competitive hackathon where output quality directly affects judging. In that case, ship one shared key via org-level Codespaces secrets.

**Steps (requires you to own a GitHub org):**

1. Move this template repo into your GitHub org if it isn't there already.
2. Go to your **org settings** → **Codespaces** → **Secrets** (the org-level one, *not* the repo-level one — repo secrets do not flow into Codespaces created from forks).
3. Click **New secret**.
4. Name it after the provider you're standardizing on:
   - `ANTHROPIC_API_KEY` for Claude
   - `OPENAI_API_KEY` for ChatGPT
5. Paste the key value.
6. Under **Repository access**, select **Selected repositories** and pick the template repo.
7. Save.

When an attendee creates a repo from the template **inside your org** and opens a codespace, the secret will be injected as an env var automatically. opencode picks it up with zero config.

### ⚠️ Important caveat
**The secret does *not* follow attendees who create their repo on their personal account.** Org Codespaces secrets only apply to codespaces created within the org. If attendees fork to personal accounts, they'll need to bring their own key (Option 2 in the README) or `opencode auth login` (Option 3).

**Mitigation:** instruct attendees in your kickoff to create their repo *inside the event org*, not on their personal account. Give them the org URL up front.

### Cost & rate-limit watch
- Set a **spend limit on the API key** at the provider side before the event. A loose model + an enthusiastic attendee can burn through credits fast.
- Consider one key per team rather than one for everyone, if you can manage the distribution.

## 3. Cost math: who pays for the codespaces?

**Free tier (default for attendees):**
- Each attendee gets 120 core-hours/mo (Free plan) or 180 (Pro/Student) **from their personal GitHub account**.
- A 2-core codespace = 2 core-hours per real hour. 120 hours ÷ 2 = **60 real hours** before they hit the wall. More than enough for a weekend hack.
- **Cost to you: $0.** This is the default, and it's the right call for most events.

**Org-paid (only if you want to cover it):**
- Configure in org settings → Codespaces → **Spending limit**.
- 2-core codespace billing rate: **$0.18/hour**, plus storage at **$0.07/GB/month**.
- There's **no free org tier** — every minute is billed to your org payment method.
- 100 attendees × 8 hours × $0.18 ≈ **$144** for the compute alone.
- Only worth it if your audience is genuinely non-technical and you expect many to lack their own free tier already (e.g. they've used it for school work that month).

## 4. Pre-event checklist

Do this **at least 48 hours before the event**, not the morning of.

- [ ] **Spin up a test codespace from this template.** Time it (expect 1-2 minutes). Confirm `node --version`, `python3 --version`, `opencode --version`, `uv --version`, `gh --version`, `vercel --version`, `netlify --version`, `wrangler --version`, `neonctl --version`, and `railway --version` all succeed in the integrated terminal.
- [ ] **Verify the GHCR image is public** by running `docker pull ghcr.io/<owner>/hackathon-template-env:latest` from a clean terminal without auth. If it 403s, flip the package to public per section 0.
- [ ] **Verify opencode auth works end-to-end** with the API key / mechanism you're recommending. Actually run a prompt and see a response.
- [ ] **Test one deploy CLI** all the way to a live URL (e.g. `vercel` deploying a hello-world). This catches account-verification email roadblocks ahead of time.
- [ ] **Check the org Codespaces secret** is visible to a fresh codespace by `echo $ANTHROPIC_API_KEY` (or whichever you set).
- [ ] **Confirm the template toggle is on:** `gh repo view <owner>/<repo> --json isTemplate`.
- [ ] **Have a fallback ready.** If GitHub Codespaces has an outage during the event, what do you tell attendees? Options: Gitpod, StackBlitz, local install instructions. Pre-write the announcement.
- [ ] **Draft a one-pager** with the repo URL + "Use this template" instructions to project on a screen during kickoff.

## 5. During the event

**~80% of support requests will be auth-related.** Specifically:
- opencode says "no API key found" → check env var name, check they're in the org repo
- Vercel/Netlify/Railway login flow stuck → usually the browser popup blocker, or they need to verify email
- "It says I'm out of Codespaces hours" → they used the free tier earlier this month; have them switch to Pro (free for students) or use a different account

Have a dedicated "auth help desk" volunteer if your event is more than ~30 people. It pays for itself.

Good luck!
