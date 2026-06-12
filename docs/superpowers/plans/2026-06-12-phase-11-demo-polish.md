# Phase 11: Demo Polish — Packs in Panel, Gauntlet Sign-off, Visual QA Harness

> Executed via subagent-driven-development. Final phase of the v6 rework.

**Goal:** make the SDK customization panel offer one-tap theme packs (parity with the snippet), formalize the ten-vibe gauntlet as a repeatable Playwright visual-QA harness with a written sign-off, so the v6 success criteria are demonstrably met inside the real SDK (not just the gauntlet's client-side applyAnyTheme bypass).

## Part 1: one-tap packs in the panel

- New pure helper `packages/core/src/agent/apply-pack.ts`: `applyPack(packId, context) → PipelineResult`-shaped — compile the pack's StyleSpec via `compileTheme` + `deriveConstraints(config)`, build the v2 candidate (roles + carried slots + styleSpec), run `verifyV2`, then `persistAndApply` (reuse the pipeline's store/apply path — extract `persistAndApply`/`loadCurrentV2` into a shared module both pipeline.ts and apply-pack.ts import, or export them from pipeline.ts; do NOT duplicate). This is the LLM-free path: a pack is a known-good StyleSpec, so it skips Gatekeeper+Designer entirely but still goes through Compiler+verify+persist.
- Panel UI: a "Starting points" row of pack chips rendered in the empty-state (and/or above the input), each a button that calls `applyPack` and appends a success history item. Packs work WITHOUT an apiKey (the value of showing quality before the user types or even has a key configured — DESIGN 1.6c). Style the chips to read as designed, not debug.
- Gate which packs show by the config's `allowed_modes`/`font_registry` constraints if set (a pack whose mode/font is disallowed is hidden) — reuse deriveConstraints; if a pack fails to compile under constraints, omit it (don't show a broken chip).

## Part 2: Playwright visual-QA harness

- `apps/demo/scripts/visual-qa.mjs` (or a Playwright test under `apps/demo/`): boots the demo (or assumes a running server on a port arg), iterates the ten gauntlet packs via `/gauntlet?pack=<id>` + default + `?sidebar=blue` + `?demo=overrides`, screenshots each to a known dir, and runs a deterministic ASSERTION pass per shot (not just capture): for each pack, read the applied `:root` role values via `page.evaluate(getComputedStyle(documentElement))` and assert (a) the ten accents are mutually distinct (no two packs within ΔE/hue threshold), (b) text-primary on surface-1 meets WCAG AA (recompute contrast in-page or pull hexes and check in node), (c) the font-display link for the pack's pairing is present. Fail the script (exit 1) on any violation. This is the compiler-guarantee regression net as a runnable harness.
- A `pnpm visual-qa` script wiring (build demo → start → run harness → stop). CI-shaped but runnable locally; document that it needs the dev server.

## Part 3: gauntlet sign-off

- `docs/gauntlet-signoff.md`: the ten vibes, each with its pack id, the StyleSpec direction (one line), the measured text-primary/surface-1 contrast, and a PASS/observation. Plus the success-criteria checklist from CLAUDE.md (ten distinct coherent AA themes / sidebar-blue auto-contrast / snippet round-trip / invariance check blocks a removed slot) with the evidence/commit for each — a single artifact proving v6's success criteria are met.

## Verify

`pnpm build && pnpm test` green; the visual-qa harness runs clean (exit 0) against the booted demo with all assertions passing; packs apply one-tap in the panel (Playwright: open the demo, open the panel, click a pack chip, screenshot the recolor, confirm :root changed). Screenshots to /tmp/p11/.

## Exit

Packs are one-tap in the SDK panel (no key needed); the visual-QA harness asserts the ten-vibe gauntlet passes (distinct + AA) deterministically; the sign-off doc records v6 success-criteria evidence. This closes the v6 rework.
