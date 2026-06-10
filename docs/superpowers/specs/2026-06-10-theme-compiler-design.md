# Theme Compiler, Registries, and theme.json v2 — Phase 1 Design

Date: 2026-06-10
Status: approved design, pre-implementation
Covers: CLAUDE.md phase scope items 1 and 2

## Context

v6's defining requirement is that every output looks professionally designed, guaranteed by deterministic code rather than requested from a model (DESIGN.md §1.2). Phase 1 builds that guarantee: the Theme Compiler expands a Designer-emitted StyleSpec into a complete, harmonious, WCAG-compliant role-token map, and theme.json v2 gives that output a storage home. No agent, runtime, or scanner work happens in this phase — the compiler is proven pure, against golden tests, before anything consumes it.

The LLM never picks a value. If any part of this design would require the Designer to emit a hex, px, or font name outside the registry, that part is wrong.

## Scope

In: `packages/core/src/compiler/` (six modules), `packages/core/src/registries/` (two registries, starter set), theme.json v2 types/schema/upgrade in `packages/core/src/config/`, culori added as a dependency of `invariance` (core).

Out (later phases): Designer agent and Gatekeeper routing (3), slot-edit micro-mutations (4), render-driven runtime (5), scanner role clustering/emission (6), SSR inlining and font loading (7), CLIs (8), Trial Mode (9), demo (10). Nothing in Phase 1 imports React.

## Architecture: ramp-first pipeline

```
StyleSpec (validated by zod)
  -> ramps.ts      neutral ramp (11 steps) + accent ramp (5 steps), OKLCH
  -> roles.ts      ramp steps -> role tokens; locked tokens pass through
  -> contrast.ts   binary-search L for every declared (text, surface) pair
  -> tokens.ts     radius / shadow / density / border-width / font tables
  -> compile.ts    compileTheme(spec, constraints, locks) -> { roles, warnings }
```

Chosen over a joint constraint solver (harder to keep deterministic and debug, unneeded at ~22 tokens) and over preset interpolation (caps expressiveness at the pack library). Each stage is a pure function; failures are attributable to one stage.

## StyleSpec

Exactly the 12-field shape in DESIGN.md §1.4 — `mode`, `accentHue`, `accentChroma`, `secondaryHue?`, `neutralTint`, `neutralTintStrength`, `contrast`, `fontPairing`, `radius`, `shadow`, `density`, `borderWeight`, `rationale`. Defined once in `compiler/style-spec.ts` as the TS interface plus a zod schema (the same schema later drives the Designer's structured output). Field semantics and taste rules live in the design-taste skill and are not duplicated here.

`secondaryHue` is accepted and validated in Phase 1 but only feeds `accent-subtle` tinting when present; full duotone treatment is a compiler extension that can land later without a schema change.

## Role vocabulary v1 (canonical — from the design-taste skill, kept in sync with `compiler/roles.ts`)

| Group | Tokens |
|---|---|
| Surfaces | `--inv-surface-0` (page), `--inv-surface-1` (cards/sidebar), `--inv-surface-2` (elevated/popovers) |
| Text | `--inv-text-primary`, `--inv-text-secondary`, `--inv-text-disabled` |
| Accent | `--inv-accent`, `--inv-accent-hover`, `--inv-accent-contrast` (text ON accent), `--inv-accent-subtle` (tinted bg) |
| Structure | `--inv-border`, `--inv-border-strong`, `--inv-ring` (focus) |
| Type | `--inv-font-display`, `--inv-font-body`, `--inv-font-mono` |
| Shape/space | `--inv-radius-base`, `--inv-radius-lg`, `--inv-shadow-1`, `--inv-shadow-2`, `--inv-density-unit`, `--inv-border-width` |

22 tokens. Delta from the earlier conversation draft (approved table said ~18): adds `accent-hover`, `ring`, `font-mono`, `radius-lg`; renames `text-muted` → `text-disabled`, `accent-soft` → `accent-subtle`, `space-unit` → `density-unit`. The design-taste skill is the canonical source; this spec follows it.

## Compiler modules

### ramps.ts

All functions pure: `(spec fields) -> oklch color[]`. No `Date`, no randomness.

- **Neutral ramp, 11 steps.** Fixed non-linear lightness scale concentrating resolution near the light end, declared as a constant (deterministic, golden-testable):
  `L_SCALE = [0.98, 0.955, 0.92, 0.86, 0.78, 0.68, 0.57, 0.46, 0.36, 0.25, 0.15]`
  Light mode reads the scale as-is; dark mode reverses it (so surface steps never reach pure black `l=0` or pure white — design-taste principle 5 holds by construction). Chroma by `neutralTintStrength`: none=0, subtle=0.02, strong=0.04, hue = `neutralTint`; multiply chroma by 0.6 / 0.4 / 0.25 on the darkest three steps to avoid muddy warm-hue artifacts.
- **Accent ramp, 5 steps** at fixed lightness scale `ACCENT_L_SCALE = [0.85, 0.75, 0.65, 0.55, 0.45]`; the center step (index 2) is `--inv-accent`. When a locked accent seeds the ramp, its parsed L replaces the center and neighbors offset by headroom-scaled steps — `up = min(0.1, (0.95 − L)/2)`, `down = min(0.1, (L − 0.2)/2)` — so steps stay distinct even for very light/dark seeds (identical to ±0.10/±0.20 for L in [0.4, 0.75]). Chroma by `accentChroma`: muted=0.08, medium=0.15, vivid=0.22 — each step `clampChroma`-ed to the sRGB gamut **after** setting L (max in-gamut chroma varies wildly by hue: yellows allow high chroma at high L, blues clip early; never assume a chroma fits at every hue).
- Dark mode reduces accent chroma slightly (×0.9) per design-taste principle 5.

### contrast.ts (the core invariant)

```
solveTextL(surfaceHex, hue, chroma, targetRatio):
  binary search l in [0,1], 24 iterations
  candidate = clampChroma({ mode:'oklch', l, c: chroma, h: hue }, 'oklch')
  ratio     = wcagContrast(formatHex(candidate), surfaceHex)
  direction: branch once by comparing the two extremes — search downward
             (dark text) iff wcagContrast(black, surface) >= wcagContrast(white, surface).
             (NOT luminance > 0.5: the black/white crossover is at luminance
             ~0.179, so mid-tones like #e94560 at 0.224 need dark text)
  return the first candidate meeting targetRatio with minimal distance
  from the ramp's nearest step (keeps solved text harmonious with the ramp)
```

Two non-negotiables, both verified against culori 4.0.2 behavior:
1. **Contrast is always recomputed on the gamut-mapped sRGB color** inside the loop. `formatHex` silently clips out-of-gamut channels, and OKLCH L is perceptual lightness, *not* WCAG relative luminance — equal L steps do not yield equal ratios. Solve numerically, never derive from L deltas.
2. **The solver never returns a failing pair.** If the target is unreachable at the given hue/chroma (rare: vivid yellows on white), retry with chroma halved, then chroma 0. A graceful achromatic text token beats an inaccessible vivid one.

Worked example (measured): white on brand accent `#e94560` is 3.83 — a FAIL at 4.5. Black on it is 5.48 — a PASS. `accent-contrast` must be solved per accent, never defaulted to white; mid-lightness accents (L ≈ 0.6–0.7) frequently fail against both white and near-white. When the accent is locked, the locked value never moves — the dependent token does.

### roles.ts

Maps ramp steps to roles plus the lock pass:

| Role | Light mode | Dark mode |
|---|---|---|
| surface-0/1/2 | L_SCALE steps 0/1/2 | reversed steps 0/1/2 (0.15/0.25/0.36) |
| border / border-strong | steps 3 / 4 | reversed steps 3 / 4 |
| text-primary/secondary/disabled | solved (see pair matrix) | solved |
| accent | accent ramp center | center, chroma ×0.9 |
| accent-hover | one accent step toward surface contrast (darker in light mode, lighter in dark) | same rule |
| accent-subtle | lightest accent step blended toward surface-1, chroma ≤ 0.06 | darkest accent step blended toward surface-1 |
| ring | accent, L-adjusted until ≥ 3.0 vs surface-0 and surface-1 | same |

Locked tokens (`constraints.locked_tokens`) pass through byte-identical; dependent tokens solve *around* them. A locked accent additionally seeds the accent ramp: parse to OKLCH (guard `h ?? 0` — hue is `undefined` for achromatic colors), use its hue/chroma as the ramp seed so hover/subtle stay related to the brand color.

### tokens.ts

Fixed lookup tables — taste decisions frozen as data:

| Profile | radius-base / radius-lg | shadow-1 / shadow-2 | border-width | density-unit |
|---|---|---|---|---|
| sharp | 0px / 0px | — | — | — |
| subtle | 4px / 8px | — | — | — |
| rounded | 12px / 20px | — | — | — |
| pill | 999px / 999px | — | — | — |
| flat | — | none / none | — | — |
| subtle (shadow) | — | `0 1px 2px rgb(0 0 0 / 0.08)` / `0 4px 12px rgb(0 0 0 / 0.10)` | — | — |
| pronounced | — | `0 2px 8px rgb(0 0 0 / 0.15)` / `0 12px 32px rgb(0 0 0 / 0.22)` | — | — |
| hard-offset | — | `4px 4px 0 #000` / `6px 6px 0 #000` | — | — |
| hairline / standard / heavy | — | — | 1px / 2px / 3px | — |
| compact / standard / comfortable | — | — | — | 3px / 4px / 5px |

Dark-mode shadows raise alpha ×1.6 (shadows need more presence on dark surfaces); hard-offset stays pure black in both modes (the neobrutalist language is the point). Fonts: `fontPairing` resolves through the registry to `font-display`/`font-body` values with full fallback stacks; `font-mono` comes from the pairing's optional `mono` field, else the default mono stack (`'JetBrains Mono', ui-monospace, 'SF Mono', monospace`).

### compile.ts

```ts
compileTheme(spec: StyleSpec, constraints: DesignConstraints, locks: Record<string, string>)
  -> { roles: Record<string, string>, warnings: string[] }
```

Orchestrates the stages. Behavior contract:
- Never throws on a schema-valid spec. Unsatisfiable inputs (e.g., a locked surface and locked text that cannot reach the contrast floor together) produce the closest-achievable result plus a warning — never a broken page, never an exception at runtime.
- `constraints.accent_chroma_max` caps the chroma table value before ramp generation; `constraints.contrast` overrides the per-level targets; `allowed_modes` rejects a disallowed `mode` at validation (that one *is* a zod failure, surfaced to the Designer's retry path in phase 3).
- All emitted color values are lowercase 6-digit hex, post gamut-mapping.

## Contrast pair matrix

Targets by `contrast` level: soft → 4.5 body (3.0 permitted only for tokens explicitly marked large-text), standard → 4.5, high → 7.0.

| Pair | Target |
|---|---|
| text-primary vs surface-0, surface-1, surface-2 | level target (worst surface governs) |
| text-secondary vs surface-0, surface-1 | ≥ 4.5 |
| text-primary vs accent-subtle | ≥ 4.5 |
| accent-contrast vs accent, accent-hover | ≥ 4.5 |
| text-disabled vs surface-1 | ≥ 3.0 (quality floor; WCAG exempts disabled UI, we don't ship illegible) |
| ring vs surface-0, surface-1 | ≥ 3.0 (WCAG 2.2 focus appearance) |

Border tokens are not contrast-enforced in Phase 1 (decorative); `border-strong` vs surface-1 ≥ 3.0 is emitted as a *warning* when missed, not a failure, since it affects input affordance.

## theme.json v2

```jsonc
{
  "version": 2,
  "base_app_version": "v1",
  "theme": {
    "roles": { "--inv-surface-0": "#0f1117", "--inv-font-display": "VT323", ... },
    "slots": { "--inv-sidebar-bg": "var(--inv-surface-1)", "--inv-header-bg": "#123456" },
    "styleSpec": { /* the StyleSpec that produced roles — provenance + undo */ }
  },
  "content": { ... }, "layout": { ... }, "components": { ... }   // unchanged from v1
}
```

- Types in `config/types.ts`: `ThemeSection` gains `roles?: Record<string,string>` and `styleSpec?: StyleSpec`; `slots` becomes `Record<string,string>` (CSS-var key → literal or `var()` reference). The v5 inline-style slots shape (`Record<string, Record<string,string>>`) is **not** carried into v2 — its deletion from the runtime is phase 4/5; in Phase 1 the v2 type simply doesn't admit it.
- Zod schema in `config/schema.ts`: discriminate on `version`; v1 documents continue validating against the existing schema.
- **Upgrade** (`config/upgrade.ts`, pure function `upgradeThemeJson(v1) -> v2`): every `--inv-*` key in v1 `theme.globals` copies to `slots` verbatim (they are slot-shaped literals like `--inv-sidebar-bg: "#1a1a2e"`); the v1 structured groups (`colors`/`fonts`/`radii`) convert to the same prefixed CSS-var names the v1 `apply-theme.ts` generated for them, also into `slots`; `roles` starts empty and is populated by the first compile. `version` becomes 2. Old inline-style slot objects are dropped with a warning (they were never user-durable). Loader (`parser.ts` / theme load path) accepts both versions and upgrades v1 in memory.

## Registries (starter set)

`registries/font-pairings.ts` — ~12 entries: `{ id, display, body, mono?, fallback stacks, tags[] }`. Must cover the categories the design-taste skill requires: mono/terminal, geometric grotesk, humanist sans, editorial serif, slab, rounded/playful, condensed industrial. Every family name verified against Google Fonts spelling exactly (a typo silently falls back and the theme loses its personality with no error).

`registries/theme-packs.ts` — 10 named StyleSpecs, one per gauntlet vibe: retro-arcade, neobrutalist, soft-pastel, terminal-green, glass-dark, editorial, ocean, sunset, mono, corporate-trust. Authored under the design-taste skill's checklist: five-word direction first, consistent material-language triple (radius/shadow/borderWeight), distinctness rule (no two packs share both fontPairing and accentHue within 30°), compile + contrast-check each.

Packs are presets only in the UI sense: free-form requests flow Designer → Compiler over the full StyleSpec space (effectively infinite themes). Packs exist as few-shot taste examples, shortcuts, and one-tap starting points. The font registry is the one deliberately finite dimension — developer-expandable via config, never free-form.

## Testing

All demo-independent, colocated `*.test.ts`, vitest:

1. **Golden snapshots** — all 10 packs compile to checked-in token maps; byte-identical (CLAUDE.md determinism requirement).
2. **Compiler invariants** (each its own test): determinism (same spec → identical output), completeness (all 22 roles present), contrast (every matrix pair meets target — recomputed with `wcagContrast` directly, independent of solver internals), gamut (every emitted hex round-trips `parse → formatHex` unchanged), locks (locked tokens byte-identical in output; dependent tokens adapt).
3. **Spec-grid sweep** — every enum combination × 12 hues (0°–330° step 30°) × both modes compiles with zero contrast violations and zero exceptions. (~4k specs; pure functions, fast.)
4. **Edge cases** — achromatic locked tokens (`h` undefined), vivid-yellow-on-white solver fallback (chroma halve → 0), `accent_chroma_max` capping, unsatisfiable lock pair → warning not throw.
5. **theme.json v2** — zod round-trips for v1 and v2 fixtures; `upgradeThemeJson` golden fixtures (v5 scanner-shaped globals in → v2 slots out); loader accepts both.
6. **Registry validation tests** — every pack passes the StyleSpec schema; every pack's `fontPairing` id exists; pack distinctness rule enforced as a test.
7. **Contrast script** — `node .claude/skills/oklch-compiler/check-contrast.mjs <tokens.json>` runs against every pack's compiled output in a test (or CI step); exits nonzero on any failing pair.

Existing 136 tests untouched and green.

## Error handling summary

| Condition | Behavior |
|---|---|
| Schema-invalid StyleSpec | zod error (Designer retry path consumes it in phase 3) |
| Disallowed `mode` per constraints | zod refinement failure (same path) |
| Contrast unreachable at hue/chroma | solver degrades chroma (½, then 0), succeeds |
| Unsatisfiable lock combination | closest-achievable output + warning, no throw |
| Out-of-gamut anything | clamped before hex emission, silent (by design) |
| Unknown `fontPairing` id | compile error at validation (registry membership is part of the schema refinement) |

## Dependencies

`culori@^4` added to `packages/core` `dependencies` (the compiler ships in the SDK; it is not dev-only). No other new dependencies. Trial Mode (phase 9) will reuse these pure modules in its bundle — another reason nothing here may import React or touch the DOM.

## Open questions

None — decisions above were settled in the 2026-06-10 brainstorming session.
