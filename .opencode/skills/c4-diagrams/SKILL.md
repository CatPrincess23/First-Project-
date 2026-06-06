---
name: c4-diagrams
description: Generate source-grounded C4 architecture diagrams (Context / Container / Component) for an existing codebase. Use when the user asks to "draw the architecture", "create C4 diagrams", "document the system structure", "diagram this codebase", or wants visual onboarding material. Three-phase workflow — Discovery → Diagrams → Self-review — with strict grounding rules: every box and arrow must trace to a real file or call site, ambiguities are listed rather than guessed. Output: PlantUML using the C4-PlantUML stdlib, placed under docs/architecture/, plus a README with per-element source citations and structural design observations.
argument-hint: "[optional: target directory or scope hint]"
---

# Source-grounded C4 architecture diagrams

Generate C4 diagrams for an existing codebase. The output is intended to onboard
new engineers, so **accuracy matters more than completeness** — a smaller correct
diagram beats a larger speculative one.

The workflow has three phases. Do them in order. Do not skip Phase 1, even if the
codebase looks small.

---

## Ground rule: code is the source of truth

Before any phase, internalize this:

- **Investigate, don't ask.** Default to reading the code yourself. Only ask the
  user a question when the code genuinely cannot answer it — examples:
  deployment topology not in the repo, an env var consumed by an external
  system, the team's intent for a clearly experimental module. "What does
  this function do?", "Is this still used?", "Which database does this hit?"
  are **never** good questions to ask the user — they are questions to answer
  with grep, by following imports, and by reading the actual function body.
  Asking the user for things the code already says is a failure mode, not a
  conservative move.

- **Follow the call path, don't trust the label.** Function names, file names,
  comments, docstrings, type names, and READMEs are all evidence, but they
  are not authoritative. They lie or rot. The code path is authoritative.
  When a docstring says "sends an email", open the function, see what it
  actually calls. When a file is named `userService.ts`, confirm what it
  imports and what its callers actually invoke. When a comment says "legacy",
  grep for callers before believing it.

- **When evidence conflicts, prefer the code.** If a docstring says one thing
  and the implementation does another, the implementation is what runs. Note
  the discrepancy in "Things I couldn't verify" or as a design observation
  ("the docstring on `X` claims Y but the body does Z") — do NOT split the
  difference or pick the friendlier-sounding option.

- **Verify before you draw.** Every arrow on a diagram is a claim that a call
  exists. Before drawing it, you should be able to point at the file and
  line where the call happens. If you can't, either find it or don't draw
  the arrow.

This rule applies recursively. If you find yourself about to write "this
appears to..." or "presumably...", stop and grep. If you find yourself about
to ask the user "is X true?", stop and read the relevant file.

---

## Phase 1: Discovery

Before generating any diagrams, investigate the codebase and produce a written
report covering the items below. Write the report to
`docs/architecture/PHASE1-DISCOVERY.md` (create the directory if missing) AND
show the contents inline so the user can confirm before you proceed.

1. **Entry points** — every entry point the runtime actually starts at: server
   bootstrap files, CLI entries, worker entries, scheduled jobs, lambda
   handlers, browser SPA mount points, etc. Quote the file path for each.
2. **External dependencies** — every external service this code talks to:
   databases, queues, caches, REST/GraphQL APIs, object storage, auth
   providers, payment, email/SMS, observability, feature flags, etc. Derive
   from the dependency manifest *and* from actual import statements / network
   call sites — manifests over-report (unused libs); imports under-report (services
   reached via raw HTTP). Cite the file where each integration lives.
3. **Internal modules** — the top-level source directories and what each
   appears to be responsible for. Quote one representative file per module.
4. **Configuration surface** — environment variables actually referenced in
   code (grep for the language's env-var idiom: `process.env`, `os.getenv`,
   `os.environ`, `std::env::var`, `System.getenv`, `Environment.GetEnvironmentVariable`,
   `ENV[`, etc.). These reveal external dependencies that imports don't.
5. **Unknown / unclear** — anything you couldn't determine with confidence.
   **Do not guess.** This list is a feature of the report, not a failure.

**Stop here.** Show the report and ask the user to confirm or correct before
proceeding. Do not draw anything until they say go.

### Anti-patterns at this phase

- Don't list packages that appear in the manifest but have zero imports — call
  them out separately as "listed but unused".
- Don't infer "the system uses X" from a folder name or filename. Confirm with
  a real import or call site.
- Don't conflate dev-only entry points (test runners, dev servers, build tools)
  with runtime entry points. Both are worth listing; mark which is which.
- Don't trust comments, docstrings, or README claims about what a module does.
  Open the file and read the actual implementation. If the docstring says
  "deprecated, do not use" but there are live callers, that's a finding worth
  recording — not a reason to omit the module.
- Don't ask the user "is X used?" or "what does Y do?" — those are answered
  with grep and by reading the function body. Only ask about things the code
  genuinely cannot reveal (deployment plan, external-system intent, etc.).

---

## Phase 2: Diagrams

Only proceed after the user has confirmed Phase 1.

Generate C4 diagrams as PlantUML using the C4-PlantUML stdlib loaded over the
`!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/...`
URLs. Write each diagram as its own `.puml` file under `docs/architecture/`.

### Scope rules

- **Level 1 (Context):** one diagram, the whole system, actors + externals.
- **Level 2 (Container):** one diagram, every deployable unit. If the
  deployment topology is not determinable from the repo (no Dockerfile,
  no `railway.json` / `fly.toml` / `app.yaml` / etc.), say so explicitly and
  draw the units the code shows — flag the uncertainty under "Things I
  couldn't verify."
- **Level 3 (Component):** ONE diagram per container, and **only** for
  containers with non-trivial internal structure. Do not draw a Component
  diagram for a container that's just a thin wrapper.
- **Level 4 (Code):** SKIP unless the user explicitly asks. Most components
  don't need it.

### Grounding rules — mandatory

- Every element you draw must correspond to something you found in Phase 1.
  No speculative components.
- For every relationship (arrow), cite the file(s) where that interaction
  actually happens in code. Put the citation in the diagram's accompanying
  notes (the per-diagram README section), not inside the `.puml` itself.
- If you're uncertain whether something exists, **omit it** and list it under
  "Things I couldn't verify" instead of drawing it.

### Notation rules — be honest about what you know

- Use synchronous call arrows only when you've verified the call is awaited
  or synchronous. Otherwise use async.
- Do NOT use composition (filled diamond) unless you've verified the "part"
  cannot exist without the "whole" in the code's lifecycle. When in doubt,
  use plain association.
- Multiplicities only when the code makes them obvious (e.g., an array-typed
  field). Otherwise omit.
- For dependency direction: draw the arrow as it exists in the code (who
  imports/calls whom), not as you think it should be.

### Output format

For each diagram, produce:

1. The PlantUML source as a standalone `.puml` file under `docs/architecture/`.
2. A README section listing each element and the file(s) that justify its
   presence ("Sources").
3. A "Things I couldn't verify" section for anything ambiguous.
4. A "Design observations" section — but ONLY **structural** observations
   from the code (e.g., "the domain layer imports directly from the cloud
   SDK, which couples business logic to infrastructure"). Do not invent
   design intent the code doesn't show.

Put the per-diagram sections into a single `docs/architecture/README.md` so
the user has one place to read everything. Include a short rendering
instruction block at the top (PlantUML CLI + the VS Code extension are good
defaults — see "Rendering" below).

---

## Phase 3: Self-review

After generating each diagram, self-review against this checklist and report
results inline:

- [ ] Every box maps to a real file or directory I can point to
- [ ] Every arrow maps to a real import, call, or network interaction
- [ ] For every claim, I have actually read the implementation — not just the
      function name, comment, or docstring
- [ ] No "Service" / "Manager" / "Handler" boxes that don't exist in the code
- [ ] No relationships invented to make the diagram look complete
- [ ] Arrow directions match actual code dependencies, not idealized architecture
- [ ] Anything ambiguous is listed under "couldn't verify," not drawn
- [ ] Anything the user was asked about is something the code genuinely cannot
      answer — I did not delegate code-reading to the user

If any checkbox fails, fix the diagram before showing it to the user.

---

## Anti-patterns to avoid (across all phases)

- Don't draw a generic "Database" box if you haven't found actual DB code.
  Name the specific database (PostgreSQL? Redis? DynamoDB? SQLite?) and cite
  where it's used.
- Don't draw a "User" or "Admin" actor unless you've found auth code that
  distinguishes them.
- Don't invent a "Notification Service" because the system "probably has one."
  If notifications aren't in the code, they aren't on the diagram.
- Don't draw "Frontend" as a single box if you haven't seen the frontend code.
  Say "Frontend (not in this repo)" instead.
- Don't infer microservices boundaries from folder names alone — check if
  they're actually deployed separately (separate build artifacts, separate
  manifests, separate entry points).
- Don't treat any single container as homogeneous if it has architecturally
  distinct surfaces (e.g., public vs admin in one SPA, or one large router
  with many sub-flows). Either split it or annotate the cross-cutting concern.

---

## C4 abstraction limits (call these out, don't fight them)

C4 diagrams are strong at **flow and topology** (who calls whom, what crosses
process boundaries, where auth gates sit). They are weak at:

- **Schema-level facts** — table or column names, naming debt
- **Configuration sourcing** — which env var drives what
- **Negative space** — dependencies that are declared but unused, or
  abstractions that should exist but don't

If a reviewer asks "did you miss anything?", these are the categories to
acknowledge as out-of-scope for the diagrams themselves. They belong in the
Phase 1 discovery doc, not on the diagrams.

---

## Common refinement requests and how to respond

These come up after the user reviews the first pass. Handle them in place
rather than starting over.

- **"This L3 looks messy — too many boxes in one container."**
  Group with `Boundary(alias, "label") { ... }` inside the
  `Container_Boundary`. (Note: `Component_Boundary` does not nest inside
  `Container_Boundary` in current C4-PlantUML — use plain `Boundary`.) Pick
  6-or-fewer logical groupings; do not split for the sake of splitting.

- **"Did you go shallow on router/handler X?"**
  Often yes, if that module is doing multiple architecturally distinct things
  (e.g., several procedures that all write to the same column, or invite +
  user-management collapsed into one user-auth router). Surgically expand
  *only* that module into sub-components inside a `Boundary`. Don't expand
  every module symmetrically — the value is in surfacing the hidden complexity.

- **"What's missed?"**
  Audit honestly. Common misses: client-side mirrors of server-side
  duality (e.g., dual auth probes from a hook), cross-cutting components that
  aren't pages/routers (auth hooks, error boundaries), test infrastructure,
  schema migrations metadata, and any module whose size and procedure count
  exceeds the rest.

- **"Add cross-cutting annotations."**
  Use `note bottom of X` / `note right of X` for facts that span multiple
  boxes — e.g., "three components write the same column", "every email send
  is fire-and-forget". These are often more valuable than more nesting.

---

## Rendering

Recommend PlantUML CLI for local renders, VS Code's `jebbs.plantuml` extension
for interactive preview. Put a short block at the top of the README:

```bash
# install (macOS)
brew install plantuml graphviz

# render
plantuml -tsvg docs/architecture/*.puml
```

Common gotcha on macOS: VS Code's PlantUML extension reports "Unable to locate
a Java Runtime" even when Java is installed via Homebrew, because the macOS
launcher stub at `/usr/bin/java` can't find the Homebrew openjdk install.
Fix: `sudo ln -sfn /opt/homebrew/opt/openjdk/libexec/openjdk.jdk
/Library/Java/JavaVirtualMachines/openjdk.jdk` (the official `brew info
openjdk` instruction). Alternative: switch the extension's render mode to
`PlantUMLServer` — no Java needed but sends source to the public PlantUML
server, so don't use it for proprietary code.

---

## Why the discipline matters

The temptation in C4 work is to draw a complete-looking diagram that "makes
sense" architecturally. Resist it. A diagram that includes a box for
something that doesn't exist in the code is worse than a smaller diagram that
admits the gap — because the new engineer who relies on it will spend an
afternoon looking for the imaginary component before concluding the diagram
lied to them.

The grounding rules, the "Things I couldn't verify" section, and the self-
review checklist all exist to enforce this. They are not optional.
