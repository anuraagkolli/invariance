# Nebula demo on the combined platform — design

- **Date:** 2026-06-13
- **Status:** Approved (brainstorming) → Phase 0+1 plan next
- **Branch:** `feat/nebula-demo` (off `combined`)

## Context

The merge left **two parallel customization systems** in `combined`:

- **Design plane — `@invariance/design`** (our engine, renamed from `main`'s `invariance`):
  the full Nebula runtime, intact — `m.{page,slot,text,sections}` (theme + content + layout
  reorder + component-swap), `InvarianceProvider`, `useInvariance`, the rich
  `CustomizationPanel` (chat, vibe chips, keyless packs, invariant chips), the
  Gatekeeper→Designer `runPipeline`, theme storage (`createApiStorage`→`/api/themes`), SSR
  (`renderThemeCss`/`themeFromCookieHeader`). Client-side theming.
- **Business-logic plane — `@invariance/client` + `@invariance/server` + control-plane**
  (Kanav's platform): signed Mod Bundles, two-plane CDN distribution, the QuickJS hook
  sandbox, capability/policy enforcement at the API seam = **the invariants crown jewel +
  the Guardrails console view**. A narrower UI op set (`Slot` HTML-string + token/style ops
  only — no `m.text`/`m.sections`/component-swap).

The combined demo (`apps/demo`, Vite + Express **Streamline**) exercises the business-logic
plane. `main`'s **Nebula** (Next 14 + Tailwind) used only the design plane and looked far
better. Goal: bring Nebula back as the showcase demo **without losing the platform**.

## Goal / non-goals

**Goal:** A new `apps/nebula` (Next 14 + Tailwind) that runs **both planes** — Nebula's rich
design/UI customization (design plane) *and* business-logic mods + invariants enforcement +
Guardrails (business-logic plane) — so the demo is both polished and platform-complete, and
representative of a real client (a Next.js app).

**Non-goals:** unifying the two planes into one (would regress UI capability — drop
`m.text`/`m.sections`/swap); retiring Streamline (kept as the platform integration test);
the console restyle (parked on `feat/console-widget-restyle`, out of scope here).

## Decisions (ratified)

- **Sequencing: Phase 1 first** (restore Nebula on the design plane), **then Phase 2**
  (re-attach the business-logic/invariants plane).
- **Keep Streamline** as the minimal platform e2e test (incl. the Guardrails honesty test).
- **Both planes coexist** in `apps/nebula`: design plane owns UI/theme/content; business-logic
  plane owns the API seam + invariants. They do not share a provider/Slot API; that is fine —
  they govern different surfaces.

## Verified facts (de-risking)

- **Import parity: FULL.** Nebula imports **21 symbols** from `'invariance'`; **all 21 are
  already exported by `@invariance/design`** (verified — `index.ts` already re-exports
  `ThemePack` (line 86) and `ThemeJsonV2`/`ThemeSectionV2`/`AnyThemeJson` (line 90)). So the
  port needs **no changes to the design package** — only the import specifier rename
  `'invariance' → '@invariance/design'`. (Rebuild dist once so Next consumes fresh output.)
- **Next adapter already exists:** `@invariance/server` exports `withInvariance(config, handler)`
  (`fetch.ts`) — docstring literally targets `export const GET = withInvariance(config, handler)`
  for Next route handlers. No adapter to build.
- **`@invariance/design` ships built `dist/` (gitignored), peer `react>=18`.** A Next app
  consumes the built JS as a normal dep; cold start must run `pnpm -F @invariance/design build`.
- **Token vocabulary already matches:** Nebula's Tailwind config + `globals.css` use the same
  `--inv-*` role tokens the design compiler emits.
- **Nothing lost:** the scanner (`packages/cli/src/analysis/*`), Guardrails (merged to
  `origin/combined`; this branch is built on top), and the whole platform carry over — the port
  is purely additive (new app + keep Streamline).

## Architecture (both planes in one Next app)

```
apps/nebula (Next 14 App Router + Tailwind)
├─ design plane:  <InvarianceProvider> + <CustomizationPanel> + m.*   (from @invariance/design)
│                 theme stored client-side via /api/themes; SSR cookie inlining; /dev dashboard
└─ business plane: Next API routes (/api/titles,/featured,/watchlist) wrapped with
                   withInvariance({getSubject})  (from @invariance/server)
                   + an AppManifest published to the control-plane; mods/invariants/Guardrails
                   surfaced in apps/console (pointed at appId "nebula")
```

The control-plane (`:4400`) and `apps/console` (`:4600`) are unchanged and shared.

## Phased plan

**Phase 0 — Scaffold.** Create `apps/nebula` (Next 14 + Tailwind + postcss), add to the
workspace + turbo; depend on `@invariance/design` (+ `@invariance/client`,`@invariance/server`
for Phase 2). Resolve the dist-consumption detail (consume built dist; or `transpilePackages`).
Confirm a blank Next page builds in the monorepo.

**Phase 1 — Restore Nebula (design plane).** Port every Nebula file from the `main` worktree
(`/Users/anuraag/invariance-main/apps/demo`) verbatim — components, `globals.css`,
`tailwind.config.ts`, `postcss.config.js`, `titles.ts`, the `/api/themes`,`/api/themes/history`,
`/api/dev-config`,`/api/llm/*` route handlers, `lib/{dev-config,theme-diff,invariance-config}`
+ `lib/server/*` stores, the `/dev` dev menu + `components/dev/*`, and the `CustomizationPanel`
wiring in `providers.tsx`/`layout.tsx`. Rename `'invariance' → '@invariance/design'` everywhere;
add the 2 missing type re-exports to `@invariance/design`. Fix Next-14-specifics (App-Router
`#__next` inert fallback, `runtime` where needed). LLM proxy stays qwen-via-Ollama (no Anthropic
default). **Exit: `apps/nebula` runs the Nebula app + rich CustomizationPanel + `/dev` on the
design plane — the look + dev menu the user wanted, back.**

**Phase 2 — Re-attach the platform (business-logic plane).** Add Next API routes serving
`titles.ts` data (`/api/titles`,`/api/featured`,`/api/watchlist`); author `apps/nebula`'s
`AppManifest` (endpoints + policies: immutable titles/maturity, etc.); wrap each route with
`withInvariance({registryUrl, appId:"nebula", getSubject})` (`export const runtime='nodejs'`);
mount `<InvarianceProvider>` from `@invariance/client` for business-logic mod application +
`getSubject`/`subjectId` parity; seed the manifest; point `apps/console` + Guardrails at
appId "nebula". **Exit: business-logic mods + invariants + Guardrails demo on the real app.**

**Phase 3 — Polish/unify (optional, later).** Expose `bundle.design` (StyleSpec intent) in the
console; optionally fold theme-history into the console; add a rollback control-plane endpoint
(genuinely new); reconcile the two dev surfaces.

## Risks / costs

- Real Next+Tailwind stand-up in a Vite-only monorepo (bounded). `@invariance/design` dist must
  be built; Next consumes dist (or transpiles the workspace pkg).
- Two providers/planes in one app (orthogonal: UI vs API); two dev surfaces (Nebula `/dev` +
  console) until Phase 3.
- Two theme/persistence models (design = client `/api/themes`; business = signed bundles) — by
  design, different concerns.
- SSR: design-plane theme has a cookie SSR path (flash-free); business-plane mods apply
  client-side post-hydration (manifest baseline first paint).
- Dev-menu features without a combined equivalent (rollback, editable locks, per-token lock,
  per-page levels) ride on the design plane's own stores in Phase 1.
- Subject identity must match between the client provider and `withInvariance` getSubject.

## This spec seeds the Phase 0 + Phase 1 implementation plan (Phase 2/3 get their own plans).
