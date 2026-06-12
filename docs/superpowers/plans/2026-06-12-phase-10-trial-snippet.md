# Phase 10: Trial Mode Snippet (`invariance.js`)

> Executed via subagent-driven-development. Decisions here; task prompt carries detail.

**Goal:** a vanilla-TS, no-React browser bundle (`packages/snippet`, esbuild, target <35KB gz) that demos themes on any rendered page with zero source changes — the "sales motion as software" (DESIGN.md 2.2). Same Designer/Compiler brain as the SDK; same theme.json v2 format; an exported theme round-trips into Product Mode after a scan.

**The five modules (importable libraries, NOT one IIFE — the entry composes them):**
1. `mini-scan.ts` — walk the rendered DOM, read `getComputedStyle` for colors/fonts/radii on visible elements, tally observed values with a coarse element-role guess (page bg, card/panel bg, text, border) → `ColorObservation[]`-shaped input for clustering.
2. `virtual-tokens.ts` — given a clustered role assignment, generate a `<style>` rule set that maps inferred roles onto the page **by selector** (e.g. elements matching the observed page-bg get `background: var(--inv-surface-0)`), the analogue of the SDK's source-level var() rewrite. High specificity; scoped to a snippet-owned style element.
3. `observe.ts` — MutationObserver that re-applies the virtual stylesheet on SPA re-render (debounced).
4. `persist.ts` — localStorage per origin (theme.json v2), keyed by `location.origin`.
5. `export.ts` — serialize the current theme as a v2 theme.json (canonical), downloadable; this is the bridge artifact.

**The brain (reused from core, NOT reimplemented):** the snippet calls `compileTheme` + the registries + the Gatekeeper/Designer agents (raw-fetch `callClaude` works in-browser — the SDK already sets the browser header). The clustering algorithm is the scanner's `cluster.ts` logic — but the scanner package depends on ts-morph (unbundleable). RESOLUTION: extract the pure OKLCH clustering (`clusterColors` and its culori math, no ts-morph) into a shared location both scanner and snippet import — candidate: move it to `@invariance/schema`? No (schema is zod-only). Better: a new pure module in core (`compiler/cluster.ts` or `runtime/`) that scanner's `roles/cluster.ts` re-exports and the snippet imports. The agent decides the cleanest home; the constraint is: ONE clustering implementation, imported by both, no duplication.

**Import boundary (critical for bundle size):** the snippet must import ONLY pure modules (compiler, registries, agent/api+designer+gatekeeper, the shared cluster, schema types) — never core's `index.ts` barrel (it exports React `'use client'` primitives/provider). Either import deep paths or add a `invariance/headless` subpath export that re-exports only the pure surface. Measure the gz bundle; culori is the heavy dep — if over budget, document the actual size and what dominates (the 35KB is a target, not a hard gate; honesty about the real number is the requirement).

**A minimal panel UI:** the snippet injects its own tiny prompt box (vanilla DOM, no framework) — text input → Gatekeeper/Designer/Compiler → apply via virtual-tokens; plus a row of theme-pack one-tap buttons (instant, no LLM) and an Export button. Styled inline so it can't be themed by its own output.

**Honest limitations (surface them in the panel, per DESIGN 2.2):** flicker on load, fights client re-renders, breaks on redeploys, F1 + crude hide only, per-browser persistence. These are the demonstration of why Product Mode exists, not bugs.

**Verify:** package builds via esbuild to a single JS file; a Vitest/jsdom test of each pure module (mini-scan clusters a synthetic DOM, virtual-tokens emits expected rules, export produces schema-valid v2, persist round-trips); a real proof — load the snippet onto a STATIC copy of the Nebula demo (no Invariance SDK) via Playwright, apply a pack, screenshot the recolor, click Export, and confirm the downloaded theme.json passes `ThemeJsonV2Schema`. Report the gz bundle size.

**Exit (CLAUDE.md phase 10):** snippet themes an unmodified demo copy; exported theme.json round-trips post-scan (schema-valid v2 that the SDK's `initialTheme` accepts).
