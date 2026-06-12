# CLAUDE.md -- Invariance v6

## Project Overview

Invariance is a developer framework that makes existing React/Next.js apps customizable by end-users through natural language, with developer-defined invariants that can never be violated. v6's defining requirement: **every output must look professionally designed.** Aesthetic coherence and WCAG contrast are guaranteed by deterministic code (the Theme Compiler), never requested from a model.

Two adoption modes share one brain:
- **Trial Mode**: a script snippet (`invariance.js`) that demos themes on the rendered DOM of any staging site. Fragile by design, exists to sell Product Mode. F1 + hide only.
- **Product Mode**: SDK + Scanner. Wrappers and `var(--inv-*)` references live in the developer's source. Governed, render-driven, F1-F4, shipped to all users.

### The Quality Pipeline (the heart of v6)

```
User: "make it more retro"
  -> Gatekeeper (LLM, Haiku-class, temp 0.1): classify THEME | SLOT_F1 | F2 | F3 | F4 | CLARIFY | REJECT, validate levels
  -> Designer  (LLM, Sonnet-class, temp 0.7): output a StyleSpec (structured design intent, ~12 enum/number fields). NEVER raw hex/px values.
  -> Theme Compiler (pure TS + culori, NO LLM): expand StyleSpec into the full semantic token set.
       OKLCH ramps, contrast solved by binary search on lightness, gamut-mapped to sRGB.
       Harmony and AA contrast hold by construction.
  -> Verification (deterministic, safety net)
  -> Store theme.json, write tokens to :root (and SSR-inline them)
```

Slot-level F1 ("make the sidebar blue") skips the Designer: constrained value pick + contrast solve for that slot's dependent tokens.
F2/F3/F4 use the Builder as before, with structured outputs.

### Two-tier tokens

- **Roles** (15-25 app-wide): `--inv-surface-0/1/2`, `--inv-text-primary/secondary`, `--inv-accent`, `--inv-accent-contrast`, `--inv-border`, `--inv-font-display/body`, `--inv-radius-base`, `--inv-shadow-1`, density/border-weight tokens.
- **Slot tokens** default to role references: `--inv-sidebar-bg: var(--inv-surface-1)`. Whole-app themes rewrite roles; precision edits override one slot token with a literal; reset restores the var() reference.

The Scanner assigns roles during semantic analysis: deterministic clustering of observed values first, LLM only resolves ambiguity and names. LLM never picks values.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Language | TypeScript strict | everywhere |
| Target apps | React 18+ / Next.js 14+ | |
| Package manager | pnpm only | never npm/yarn |
| Monorepo | pnpm workspaces + turborepo | test depends on ^build |
| Color math | culori | OKLCH ramps, gamut mapping, WCAG contrast in compiler |
| Config | js-yaml + zod | |
| LLM | OpenAI-compatible endpoint (Ollama) OR Anthropic API, via raw fetch with structured outputs, selected by config; zod revalidation + retry make native schema enforcement optional, so weaker local models work | no SDK, no prompt-and-parse |
| Models | **Current default: open-source `qwen2.5` (Ollama) for all four agent roles, via the demo's `/api/llm` server proxy — no Anthropic key needed.** Anthropic is env opt-in (Gatekeeper: Haiku-class, Designer/Builder: Sonnet-class). | model ids in one constants file |
| Scanner | ts-morph, tailwindcss resolveConfig | |
| Trial snippet | vanilla TS bundle, no React dep, <35KB gz | esbuild |
| Testing | vitest; Playwright + screenshots for visual QA (CI only) | |

## Directory Structure (delta from v5)

```
packages/
├── schema/src/                  # NEW (phase 4): @invariance/schema — keystone contracts, depends only on zod
│   ├── style-spec.ts            # StyleSpec type + zod (moved from core/compiler)
│   ├── theme.ts                 # theme.json v1/v2 types + InvarianceConfig (moved from core/config/types)
│   ├── theme-schemas.ts         # zod schemas (moved from core/config/schema)
│   ├── role-tokens.ts           # role vocabulary (moved from core/compiler/roles)
│   └── canonical-json.ts        # sorted-key serialization (stable bytes for future signing)
├── core/src/                    # re-exports moved names from their old paths (back-compat stubs)
│   ├── compiler/                # NEW: the Theme Compiler
│   │   ├── style-spec.ts        # StyleSpec type + zod schema
│   │   ├── ramps.ts             # OKLCH neutral/accent ramp generation (culori)
│   │   ├── contrast.ts          # binary-search lightness solver, WCAG math
│   │   ├── roles.ts             # ramp -> role assignment, brand-lock pass-through
│   │   ├── tokens.ts            # radius/shadow/density token tables
│   │   └── compile.ts           # compileTheme(spec, constraints, locks) -> roles map
│   ├── registries/              # NEW: taste as data
│   │   ├── font-pairings.ts     # ~30 curated Google Fonts pairings with tags
│   │   └── theme-packs.ts       # ~15 named StyleSpec presets (few-shot + one-tap)
│   ├── agent/
│   │   ├── gatekeeper.ts        # adds THEME vs SLOT_F1 routing
│   │   ├── designer.ts          # NEW: StyleSpec via structured outputs
│   │   ├── builder.ts           # F2/F3/F4 only; theme.slots fallback REMOVED
│   │   ├── slot-edit.ts         # NEW: micro-mutation path for slot-level F1
│   │   ├── api.ts               # NEW: shared raw-fetch client, structured-output helper
│   │   └── pipeline.ts          # routing per DESIGN Part 3
│   ├── runtime/
│   │   ├── apply-theme.ts       # roles + slots to :root; v1 globals accepted+upgraded
│   │   ├── ssr.ts               # NEW: render :root style block server-side
│   │   └── (apply-content.ts, apply-layout.ts DELETED -> render-driven)
│   ├── primitives/
│   │   ├── slot.tsx             # childCss/!important + inline theme.slots REMOVED
│   │   ├── text.tsx             # renders override from context
│   │   └── sections.tsx         # NEW: renders section order/visibility from context
│   └── fonts/loader.ts          # NEW: inject <link> for registry fonts on demand
├── scanner/src/
│   ├── roles/cluster.ts         # NEW: deterministic value clustering into roles
│   └── emit/                    # emits role tier + slot var() references
├── snippet/                     # NEW: Trial Mode bundle
│   └── src/ (mini-scan.ts, virtual-tokens.ts, observe.ts, persist.ts, export.ts)
└── cli additions: invariance check (CI guard), invariance migrate-theme (version bumps)
```

## theme.json v2

`theme.roles` + `theme.slots` (CSS-var keys, values are literals or `var(...)` refs) + `theme.styleSpec` (provenance). Loader accepts v1 `theme.globals` and partitions it. The old inline-style slots object is gone. Serialized canonically (sorted keys via `canonicalStringify`) so identical themes are byte-identical — future signing/content-addressing is an envelope, not a migration. Stored themes are re-verified on load before applying (integrity net, not a permission system).

## Verification (additions to the v5 suite)

`styleSpecValid`, `compilerOutputComplete`, `lockedTokensUntouched`, `contrastPairs` (independent recompute, the safety net), `fontInRegistry`, `varRefsResolve` (slot var() targets exist). All v5 F2/F3/F4 tests unchanged.

## Invariant Config (v6 defaults)

Relational constraints replace exact-hex allowlists as the default:

```yaml
design:
  constraints:
    contrast: ">= 4.5"
    accent_chroma_max: 0.25
    locked_tokens: { --inv-accent: "#e94560" }
    allowed_modes: [light, dark]
    font_registry: default
  legacy_palette: []   # optional hard allowlist, still supported
```

After scan: pages level 0 as before, but constraints are relational so unlocking F1 immediately enables high-quality theming.

## Coding Conventions

Unchanged from v5: strict TS, named exports, no `any`, async/await only, single quotes, no semicolons, kebab-case files, colocated tests, comments explain why. New: every compiler function is pure and unit-tested against golden token snapshots; agent prompts live in template files next to their agent, not inline strings scattered around.

## Build/Test Discipline

- `pnpm build` then `pnpm test` must pass at every commit; turbo `test.dependsOn: ["^build"]` so fresh clones work.
- Do not regress the existing suite (136 tests at v5 baseline). Deleted features (DOM appliers, theme.slots fallback) take their tests with them; everything else stays green.
- Compiler determinism test: same StyleSpec in, byte-identical roles out.

## Phase Scope (v6 rework — resequenced 2026-06-11, see DESIGN.md Part 5)

1. ✅ Theme Compiler + registries (pure, no UI) with golden tests
2. ✅ theme.json v2 + v1 upgrade path
3. ✅ Designer agent + structured-outputs client; Gatekeeper routing update
4. ✅ Slot-edit micro-mutation path; Builder cleanup (F2-F4 only — theme.slots fallback, the v1 pipeline path, and slot.tsx inline-style machinery all deleted); platform-readiness retrofits (usage hook + injectable base URL in the API client, canonical theme.json serialization, verify-on-load); `@invariance/schema` extraction. *Exit: "make the sidebar blue" lands as a contrast-solved slot literal; no inline-style path remains; schema package builds standalone.*
5. ✅ Demo app ("Nebula", `apps/demo`) — Netflix-class media browser on the two-tier token system + `/gauntlet` visual harness. *Exit met: ten-vibe gauntlet judged visually distinct/coherent/readable; "sidebar blue" works live.*
   → **Decision gate before 6-7 (UNRESOLVED):** the scanner-vs-overlay integration question with the cofounder. Phases 6-7 were built on the scanner bet; revisit if that argument reopens.
6. ✅ Render-driven F2/F3 (m.text from context, m.sections); DOM appliers deleted. *Exit met: text override + reorder/hide survive React re-render (proven via `/gauntlet?demo=overrides`).*
7. ✅ Scanner: deterministic role clustering + v2 initial-theme emission with var() slot refs; verifier completeness/font checks gated on styleSpec presence so partial scanner seeds pass verify-on-load. *Exit met: fixture scan round-trips through ThemeJsonV2Schema + verifyV2.*
8. ✅ SSR theme inlining (cookie-mirror channel) + runtime font loader + hydration-safe page resolution; token values constrained to a safe CSS grammar (closes a cookie CSS-injection vector). *Exit met: themed first paint proven via curl with no flash.*
9. ✅ `invariance-check` (CI guard) + `invariance-migrate-theme` CLIs. *Exit met: removing a wrapped slot makes check exit non-zero naming the slot.*
10. ✅ Trial Mode snippet (`@invariance/snippet`, ~75KB gz, no React via `invariance/headless`): mini-scan/virtual-tokens/observe/persist/export + vanilla-DOM panel; scan-binds elements to roles once, then themes by `:root` role-value swap. *Exit met: snippet themes an unmodified static demo copy (Playwright); exported theme round-trips through `prepareStoredTheme`.*
11. ✅ Demo polish: one-tap theme packs in the SDK panel (`applyPack`, keyless, self-defending via compile+verifyV2); Playwright visual-QA harness asserting ten distinct AA-passing accents + font links (exit-nonzero on failure); gauntlet sign-off at `docs/gauntlet-signoff.md`. *Exit met: v6 success criteria recorded with evidence.*

**v6 rework complete.** All eleven phases merged to main. Full suite: 546 tests (schema 11 + core 396 + scanner 84 + snippet 55) + the demo app.

> **Note:** `apps/demo` is the live Nebula demo (built phase 5). The v5-era scanner spec is archived at `docs/scanner-v5.md` and predates the role-tier model. Per-phase implementation plans live in `docs/superpowers/plans/`.

### Success criteria

Ten consecutive vibe prompts (retro, brutalist, pastel, terminal, glassy, editorial, ocean, sunset, mono, corporate) each produce a distinct, coherent, AA-compliant theme with zero verification failures; "make the sidebar blue" adjusts contrast automatically; snippet-exported theme round-trips into the SDK post-scan; `invariance check` blocks a removed slot in CI.

## Deferred

Review UI, F5+ source path, blob storage, B-levels, theme sharing links, runtime vision QA.
