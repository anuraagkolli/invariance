# Invariance — the onboarding / scanner pipeline

*How a raw, un-wired, multi-page web app becomes a **governable** app — one the
look and business-logic pipelines (`INVARIANTS-PIPELINE.md`) can drive. This is
the **upstream** step: it runs once, at developer time, and produces the wiring
that every later end-user change relies on.*

> **Status: current design, NOT finalized.** This is our working model for the
> scanner/onboarding process, not a committed plan. The full design rationale and
> the decisions behind it live in
> `docs/superpowers/specs/2026-06-15-scalable-onboarding-archetype-layout-design.md`.
> Scope of this round: **React + Tailwind** apps; other styling families and
> frameworks are future work.

---

## 1. Why onboarding is its own pipeline

The two runtime pipelines in `INVARIANTS-PIPELINE.md` both *assume* the app is
already wired: components read `var(--inv-*)` role tokens, customizable regions
are wrapped in `<m.slot>`, and the app's archetypes + invariants are declared in
`invariance.manifest.json`. Nebula reached that state **by hand**. The scanner
today (`packages/cli/src/scan.ts`) only produces a *flat list* of
colors/routes/components — it doesn't enumerate pages, map sections, or wire
anything. That hand-wiring is what doesn't scale to "an app with many pages and
components."

**The core principle.** Everything customizable is *named once, here, at
onboarding* — token roles, page archetypes, and per-archetype sections. The
expensive, one-time job of the codemod is to make the app's call sites *reference
those names*. After that, every end-user change edits a **name's value** (a token,
a `LayoutSpec`), never the call sites — so a single change fans out across every
page of a type. (See "three centralization layers," §4.)

**Deterministic vs. LLM — same philosophy as the runtime gates.** Discovery and
verification are deterministic; the LLM only *proposes* names, section
classifications, and layout grammar. Nothing the LLM says is load-bearing for
safety: the manifest the developer merges is reviewable, and the runtime gates
re-enforce every invariant.

---

## 2. The pipeline, end to end

Legend:  `[det]` deterministic (AST / file walk / build) ·
`[LLM]` model proposes, output is advisory & developer-reviewed ·
`[gate]` deterministic verify, no LLM.

```
        ┌──────────────────────────────────────────────────────────────┐
        │ INPUT — un-wired app  (React + Tailwind, multi-page)           │
        │   hardcoded palette classes (bg-red-600, text-gray-100 …)      │
        │   no m.* slots · no role tokens · no manifest                  │
        └───────────────────────────────┬──────────────────────────────┘
                                         │
   ╔═════════════════════════════════════▼═════════════════════════════╗
   ║ STAGE 1 — DISCOVER ARCHETYPES                              [det]    ║
   ║   walk file-based routes (app/**/page.tsx)  → route patterns        ║
   ║   a dynamic segment ([id]) ⇒ ONE shared template ⇒ ONE archetype    ║
   ║   e.g.   /        /series        /title/[id]                        ║
   ╚═════════════════════════════════════╦═════════════════════════════╝
                                         │  archetype list
   ┌─────────────────────────────────────▼─────────────────────────────┐
   │ STAGE 2 — PER-ARCHETYPE MAP                    (fan-out · parallel) │
   │   ┌────────────┐   ┌────────────┐   ┌────────────────┐             │
   │   │     /      │   │  /series   │   │   /title/[id]  │    …        │
   │   ├────────────┤   ├────────────┤   ├────────────────┤            │
   │   │ AST →      │   │ AST →      │   │ AST →          │   [det]     │
   │   │  sections  │   │  sections  │   │  sections      │            │
   │   │ LLM names, │   │ LLM names, │   │ LLM names,     │   [LLM]     │
   │   │  aliases,  │   │  aliases,  │   │  aliases,      │            │
   │   │  levels,   │   │  levels,   │   │  levels,       │            │
   │   │  grammar   │   │  grammar   │   │  grammar       │            │
   │   │ color/font │   │ color/font │   │ color/font     │   [det]     │
   │   │  cluster   │   │  cluster   │   │  cluster       │            │
   │   └─────┬──────┘   └─────┬──────┘   └───────┬────────┘            │
   └─────────┼────────────────┼──────────────────┼─────────────────────┘
             └────────────────┼──────────────────┘
                              ▼  BARRIER (needs every archetype's palette)
   ╔══════════════════════════════════════════════════════════════════╗
   ║ STAGE 3 — RECONCILE PALETTE                               [det]    ║
   ║   merge per-file color/font clusters → ONE consistent assignment   ║
   ║   onto the 27 role tokens; SEED the default theme from the app's   ║
   ║   observed palette so first render is pixel-identical              ║
   ╚══════════════════════════════════╦═══════════════════════════════╝
                                      │  token assignment + section maps
   ╔══════════════════════════════════▼═══════════════════════════════╗
   ║ STAGE 4 — GENERATE ARTIFACTS  (the "settings files")     [det]    ║
   ║   • tailwind.config.*        utilities → var(--inv-*)              ║
   ║   • invariance.manifest.json designSurface: route patterns,       ║
   ║                              sections, per-archetype level         ║
   ║                              + LAYOUT INVARIANTS                    ║
   ║   • invariance.layout.ts     per-archetype LayoutSpec grammar      ║
   ║                              (allowed modes / variants / columns)  ║
   ║   • invariance-config.ts     + InvarianceProvider / widget wiring  ║
   ╚══════════════════════════════════╦═══════════════════════════════╝
                                      │  generated files
   ┌──────────────────────────────────▼───────────────────────────────┐
   │ STAGE 5 — CODEMOD            (per-file · parallel · worktree-iso)  │
   │   • repoint palette classes   bg-red-600  →  bg-accent            │
   │   • wrap archetype sections   <section…> → <m.slot name=…>        │
   │   • mount provider + CustomizationPanel                            │
   └──────────────────────────────────┬───────────────────────────────┘
                                      │  modified source
   ╔══════════════════════════════════▼═══════════════════════════════╗
   ║ STAGE 6 — VERIFY                                         [gate]   ║
   ║   typecheck / build  ·  verifyV2 (7 token tests)  ·  layout       ║
   ║   verifier (invariants)  ·  VISUAL-QA: render == before, on a     ║
   ║   default theme  (the codemod must be look-preserving)            ║
   ╚═══════════════════╦══════════════════════════════╦═══════════════╝
              fail │   │                              │ pass
                   ▼   │                              ▼
        ┌──────────────┴───────┐      ╔═══════════════════════════════════╗
        │ REPAIR (bounded loop) │      ║ STAGE 7 — REVIEWABLE DIFF          ║
        │  re-segment sections, │      ║   emit a branch / PR; developer    ║
        │  re-cluster palette,  │      ║   edits section names, levels,     ║
        │  re-generate, retry   │      ║   invariants; then merges          ║
        └───────────────────────┘      ╚═══════════════╦═══════════════════╝
                                                       │ merged
        ┌──────────────────────────────────────────────▼──────────────────┐
        │ OUTPUT — a WIRED app. Three centralization layers now live:      │
        │   Token  (var(--inv-*))                                          │
        │   Archetype  (designSurface: patterns + sections + levels)       │
        │   Layout  (LayoutSpec per archetype)                             │
        └──────────────────────────────────────────────┬──────────────────┘
                                                        │
                              ═══════════ hands off to ═══════════
                              INVARIANTS-PIPELINE.md  (look + logic, live)
```

---

## 3. Stage notes (what each step touches)

1. **Discover archetypes** `[det]` — walk the router tree. Each dynamic segment
   collapses many URLs into one **archetype** (`/title/42`, `/title/99` →
   `/title/[id]`). This is *the* move that makes "redesign one product page → all
   product pages" natural: the template is a single component, so it's a single
   place to wire and a single key to customize.
2. **Per-archetype map** `[det]`+`[LLM]` — fans out one unit of work per archetype.
   AST finds the structural section boundaries (top-level children of the page's
   main container); the LLM *proposes* a semantic name, aliases, a suggested
   customization level, and the section's layout-grammar options; a deterministic
   pass clusters the file's colors/fonts/spacing toward the role-token vocabulary.
3. **Reconcile palette** `[det]` — **barrier**: needs all archetypes' palettes at
   once to choose one consistent token assignment, and to seed the default theme
   from the app's *observed* colors so Stage 6's visual-QA can pass.
4. **Generate artifacts** `[det]` — emits the "settings files." The
   `tailwind.config` rewrite is the highest-leverage single edit: it makes the
   app's existing utility classes resolve to tokens. The manifest gains
   archetype-aware `designSurface` + **layout invariants**; `invariance.layout.ts`
   carries the per-archetype `LayoutSpec` grammar.
5. **Codemod** `[det]` — per-file, isolated (worktree per file so parallel edits
   can't collide). Repoints hardcoded palette classes to semantic ones, wraps each
   archetype's sections in `<m.slot>`, and mounts the provider + widget. This is
   the one-time "go through every instance" pass — after it, no end-user change
   touches source again.
6. **Verify** `[gate]` — deterministic. Build + `verifyV2`
   (`packages/design/src/verify/compiled-tests.ts`) + the new **layout verifier** +
   a **visual-QA** check that the wired app renders identically to the original on
   a default theme. Failure feeds a bounded repair loop (re-segment / re-cluster /
   re-generate).
7. **Reviewable diff** — because we edited the customer's source, onboarding ends
   in a branch/PR the developer reviews (rename a mis-segmented section, adjust a
   level, tighten an invariant) before merging. Extends today's `invariance init`,
   which already emits an `INVARIANCE.md` wiring guide.

---

## 4. The output — three centralization layers

| Layer | The "name" onboarding creates | One change fans out via |
|---|---|---|
| **Token** (look) | ~27 role tokens (`--inv-accent`, `--inv-space-sm` …) | CSS cascade — every page, instantly |
| **Archetype** (structure identity) | `designSurface`: route patterns + sections + levels | one template component → all its URLs |
| **Layout** (structure customization) | per-archetype **`LayoutSpec`** grammar | archetype key → every page of that type |

The token layer already exists (`packages/design/src/compiler/`,
`packages/design-schema/src/role-tokens.ts`). The **archetype** and **layout**
layers — archetype discovery, archetype-keyed customization
(`themeJson.components.pages` keyed by route *pattern*, not pathname), the
`LayoutSpec` grammar, and the deterministic **layout invariant gate** — are the
new work this onboarding pipeline exists to produce.

---

## 5. How this connects to the runtime pipelines

Onboarding's output *is* the precondition for `INVARIANTS-PIPELINE.md`:

- The **look pipeline** consumes the role tokens + the archetype-keyed slot
  registry + the `LayoutSpec` grammar + layout invariants (a theme/layout change
  compiles, verifies against the manifest, and applies per archetype).
- The **business-logic pipeline** consumes the manifest's endpoints + policies
  (a logic mod is authored, verified, signed, and runs sandboxed at the API seam).

Both gates re-enforce, at runtime, the invariants this pipeline merely *declares* —
so a mistake in onboarding is a correctness/coverage bug, never a safety hole.

---

## 6. Why it scales (and where it doesn't, yet)

The per-archetype (Stage 2) and per-file (Stage 5) stages **fan out**, so
wall-clock ≈ the slowest single unit, not the sum: a 40-page app onboards in
roughly the time of its biggest page. The shape maps cleanly onto a multi-agent
workflow — *discover → per-archetype map → reconcile (barrier) → per-file codemod
→ verify*.

Out of scope this round (noted in the spec): non-Tailwind styling families
(CSS modules, styled-components, inline, plain CSS), non-React frameworks, and
non-file-based routing. Each is an additive normalization/adapter on top of the
same skeleton.
