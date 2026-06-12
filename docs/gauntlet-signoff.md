# v6 Gauntlet Sign-off

The single artifact proving Invariance v6's success criteria are met. The ten
named vibes each compile to a distinct, coherent, AA-compliant theme with zero
verification failures, and the four headline behaviors all have runnable
evidence.

Regenerate the contrast numbers and the PASS table with the visual-QA harness:

```sh
pnpm --filter @invariance/demo build
cd apps/demo && npx next start -p 4321 &   # or: pnpm visual-qa:full
pnpm --filter @invariance/demo visual-qa   # against a running server
```

The harness (`apps/demo/scripts/visual-qa.mjs`) drives a real browser over the
gauntlet, screenshots each scene, and asserts three properties per pack:
accents mutually distinct (OKLab ΔE ≥ 0.03), `--inv-text-primary` on
`--inv-surface-1` meets WCAG AA (≥ 4.5), and the pack's font-display Google
Fonts `<link>` is present. It exits nonzero on any violation.

## The ten vibes

Contrast = measured `--inv-text-primary` on `--inv-surface-1`, compiled under
the gauntlet constraints (`contrast: 4.5`, `accent_chroma_max: 0.25`). The
browser-measured values from the harness match these compiler values exactly.

| Pack id | Vibe | StyleSpec direction (one line) | text-primary / surface-1 | Result |
|---------|------|--------------------------------|--------------------------|--------|
| `retro-arcade` | Retro | dark, amber accent (h55) on violet-black, retro-terminal mono, sharp + hard-offset + heavy | **15.15** | PASS |
| `neobrutalist` | Brutalist | light, hot-pink accent (h350), brutalist-grotesk, sharp + hard-offset + heavy, high contrast | **17.27** | PASS |
| `soft-pastel` | Pastel | light, blush accent (h330) muted, pastel-soft, rounded + subtle + hairline, soft contrast | **17.22** | PASS |
| `terminal-green` | Terminal | dark, phosphor green (h145) on near-black, terminal-mono, sharp + flat, high contrast | **15.11** | PASS |
| `glass-dark` | Glassy | dark, cool blue glow (h215), geo-grotesk, rounded + pronounced, glass panes | **15.18** | PASS |
| `editorial` | Editorial | light, oxblood accent (h15) muted, editorial-serif, sharp + flat, paper-warm neutrals | **17.17** | PASS |
| `ocean` | Ocean | light, aqua accent (h195), rounded-friendly, rounded + subtle, breezy spacing | **17.33** | PASS |
| `sunset` | Sunset | dark, burnt-orange (h25) over violet dusk, condensed-industrial display, pronounced shadow | **15.07** | PASS |
| `mono` | Mono | light, ink-on-white, mono-minimal, sharp + flat, no decoration, high contrast | **17.27** | PASS |
| `corporate-trust` | Corporate | light, navy accent (h245), corporate-clean, subtle radius + subtle shadow, quiet restraint | **17.32** | PASS |

Every pack clears AA (4.5) by a wide margin — the compiler solves contrast by
binary search on lightness, so the floor holds by construction. Dark packs sit
~15, light packs ~17; both far above the 4.5 requirement.

**Distinctness:** the ten accents are mutually distinct in OKLab. The closest
pair is `glass-dark` (#00a0bb) vs `ocean` (#00a1a2) at ΔE 0.040 — distinct by
the project's canonical pack rule (no two packs share BOTH fontPairing AND
accentHue within 30°: these differ in font *and* mode, 20° apart in hue), and
above the harness floor of 0.03. Every other pair is ≥ 0.063.

## Success-criteria checklist (CLAUDE.md)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Ten consecutive vibes → distinct, coherent, AA themes, zero verification failures | MET | `apps/demo/scripts/visual-qa.mjs` (PASS table above, exit 0). Each pack runs through the same Compiler + `verifyV2` gate as a Designer theme; the gauntlet asserts AA + accent-distinctness + font-link presence in a real browser. |
| "Make the sidebar blue" adjusts contrast automatically | MET | `packages/core/src/agent/slot-edit.ts` micro-mutation path (commit `d749659`, `ae43520`). `slot-edit.test.ts` → `solveDependentText` "meets the contrast floor against a dark background" computes a readable text token for `#1b2a4a`. The gauntlet `?sidebar=blue` scene applies the same contrast-verified pair (`--inv-sidebar-bg: #1b2a4a`, `--inv-sidebar-text: #f2f3f5`) on the live composition. |
| Snippet-exported theme round-trips into the SDK post-scan | MET | `packages/snippet/src/export.test.ts` → "round-trips through prepareStoredTheme (the SDK load gate) as ok" (Trial Mode commits `4fc3ef7`, `e151326`). The Trial snippet's exported v2 doc passes the exact `prepareStoredTheme` gate the SDK provider runs on load. |
| `invariance check` blocks a removed slot in CI | MET | `packages/scanner/src/check/index.test.ts` → "fails with a missing-slot violation when a slot wrapper is removed" (commit `036a3f0`). `runCheck` returns a non-passing result (CI exit nonzero) when a `<m.slot>` wrapper is deleted from source. |

## One-tap packs in the SDK panel (Phase 11)

The packs are not just a gauntlet bypass — they ship in the real SDK
customization panel as the keyless quality-preview path (DESIGN 1.6c):

- `packages/core/src/agent/apply-pack.ts` — `applyPack(packId, context)` runs
  the pack's known-good StyleSpec through Compiler → `verifyV2` → persist,
  skipping the Gatekeeper + Designer (no apiKey). `availablePacks(config)`
  filters to packs the app's constraints permit. Both tested in
  `apply-pack.test.ts`.
- The panel (`customization-overlay.tsx`) renders a "Starting points" chip row
  that stays clickable with no API key configured. Verified live: with
  `apiKey=''`, all ten chips render, and clicking one recolors `:root`
  (`--inv-accent` #ee4c6e → #e942a2 for Neobrutalist) and posts a success
  bubble.

This closes the v6 rework.
