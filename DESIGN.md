# Invariance v6 -- Hybrid Adoption + Design Quality Architecture

## What Changed From v5 and Why

v5 proved the mechanics: scanner-wired CSS variables, deterministic verification, per-user theme.json, two-agent pipeline. The 136-test codebase implements it. v6 keeps all of that and changes three things that determine whether anyone actually wants the product:

1. **Design quality becomes the core architecture, not a prompt-engineering hope.** v5's Builder edits individual variables and cannot produce a coherent "make it retro." v6 introduces a semantic token tier, a Designer agent that outputs structured design intent (StyleSpec), and a deterministic Theme Compiler that expands intent into a complete, harmonious, contrast-guaranteed token set using OKLCH color math. The LLM never picks a hex value.

2. **Hybrid adoption.** A one-line script snippet (Trial Mode) demos the experience on any site in five minutes with zero code changes. The SDK + Scanner (Product Mode) is what customers actually deploy. Both modes share the same Designer/Compiler pipeline and theme.json format, so a theme built in Trial Mode ports into Product Mode after migration.

3. **Render-driven runtime.** F2 content and F3 layout resolve inside React rendering (primitives read theme.json from context), replacing the v5 DOM-mutation appliers that React silently reverts. The theme.slots inline-style fallback is deleted; --inv-* variables are the only F1 substrate.

---

## Core Thesis (unchanged, sharpened)

Developers define **invariants** (constraints that must always hold) and **unlock levels** (what users can change). Users describe changes in natural language. The pipeline turns intent into a verified theme.json mutation. What is new in v6: the pipeline is built so that the *worst* output it can produce is still professionally designed and accessible, because aesthetic coherence and contrast are enforced by deterministic code, not requested from a model.

The product is judged on one question: when a user says "make it more retro," does the result look like a designer did it? Everything in this document serves that question.

---

## Part 1: The Design Quality System

### 1.1 Why v5 could not do "make it retro"

- The Builder mutates per-slot variables (--inv-sidebar-bg) one at a time. A vibe is 30 to 60 coordinated decisions. Independent hex picks have no enforced harmony: clashing hues, mismatched neutrals, broken contrast.
- Post-scan invariants pin the palette to the exact observed colors, so any new aesthetic is illegal by construction.
- Hex is a terrible space for an LLM to be creative in. Perceived lightness and saturation are nonlinear in RGB, so even a good model produces muddy or vibrating combinations.

### 1.2 The fix: separate taste from arithmetic

```
User: "make it more retro"
    |
    v
Gatekeeper (LLM, small/fast)  -- classify: THEME intent (whole-app) vs SLOT intent
    |                            (single target) vs CONTENT/LAYOUT/SWAP, validate levels
    v
Designer (LLM, strongest)     -- output a StyleSpec: structured design intent.
    |                            Mood, seed hues, neutral temperature, contrast level,
    |                            font pairing id, radius profile, shadow profile,
    |                            density. NEVER raw token values.
    v
Theme Compiler (deterministic TS, no LLM)
    |                          -- expand StyleSpec into the full semantic token set:
    |                            OKLCH ramps via culori, contrast solved by binary
    |                            search on lightness, gamut-mapped to sRGB hex.
    |                            Harmony and WCAG AA are guaranteed by construction.
    v
Verification (deterministic)  -- same engine as v5; now mostly a safety net because
    |                            the Compiler cannot emit a violating theme
    v
Store + Apply                 -- theme.json saved, semantic tokens written to :root
```

The Designer is where taste lives. The Compiler is where correctness lives. A bad Designer output produces a boring theme, never an ugly or inaccessible one.

### 1.3 Semantic token tier (the biggest structural change)

v5 tokens are per-slot: --inv-sidebar-bg, --inv-header-border. Keep them, but introduce a role tier above them, and have slot tokens default to *referencing* roles:

```css
:root {
  /* Tier 1: semantic roles (15 to 25 tokens, app-wide) */
  --inv-surface-0: #0f1117;      /* page background */
  --inv-surface-1: #171a21;      /* cards, sidebar */
  --inv-surface-2: #1f232c;      /* elevated elements */
  --inv-text-primary: #f2f3f5;
  --inv-text-secondary: #9aa3b2;
  --inv-accent: #e94560;
  --inv-accent-contrast: #ffffff; /* text on accent */
  --inv-border: #2a2f3a;
  --inv-font-display: 'Inter';
  --inv-font-body: 'Inter';
  --inv-radius-base: 8px;
  --inv-shadow-1: 0 1px 2px rgb(0 0 0 / 0.3);
  /* ... */

  /* Tier 2: slot tokens, defaulting to role references */
  --inv-sidebar-bg: var(--inv-surface-1);
  --inv-sidebar-text: var(--inv-text-primary);
  --inv-header-bg: var(--inv-surface-0);
  --inv-header-border: var(--inv-border);
}
```

Consequences:

- "Make it retro" rewrites ~20 role tokens. Every slot shifts together, coherently, in one mutation. This is what makes whole-app restyling possible at all.
- "Make the sidebar blue" overrides one slot token with a literal value, breaking only that slot's link to its role. Precision edits still work.
- "Reset the sidebar" restores the var() reference. Undo is trivial.
- The Scanner's semantic analysis phase gains one job: classify each extracted value into a role (this surface is surface-1, this text is text-secondary). The LLM still never picks values; it labels them. Clustering by observed value does most of the work deterministically (the three colors #ffffff/#fefefe/#fafafa are one role); the LLM resolves ambiguity and names.

### 1.4 StyleSpec schema (Designer output)

The Designer emits this and only this, enforced by the API's native structured outputs (strict JSON schema, no parse failures):

```typescript
interface StyleSpec {
  mode: 'light' | 'dark'
  // Seed hues in OKLCH hue degrees. Designer picks 1 to 3.
  accentHue: number            // 0-360
  accentChroma: 'muted' | 'medium' | 'vivid'
  secondaryHue?: number
  // Neutrals are a ramp tinted toward a hue at low chroma
  neutralTint: number          // hue degrees, e.g. 250 for cool gray
  neutralTintStrength: 'none' | 'subtle' | 'strong'
  contrast: 'soft' | 'standard' | 'high'
  fontPairing: string          // id from the curated pairing registry
  radius: 'sharp' | 'subtle' | 'rounded' | 'pill'
  shadow: 'flat' | 'subtle' | 'pronounced' | 'hard-offset'  // hard-offset = neobrutalist
  density: 'compact' | 'standard' | 'comfortable'
  borderWeight: 'hairline' | 'standard' | 'heavy'
  rationale: string            // one sentence, shown to the user in the panel
}
```

Roughly 12 fields. Small enough that the model reasons well about all of them jointly, expressive enough to span retro, brutalist, terminal, pastel, glassy, editorial, and corporate without free-form values.

### 1.5 Theme Compiler (deterministic, the quality guarantee)

Pure TypeScript, culori as the only dependency. Given a StyleSpec:

1. **Neutral ramp.** Generate an 11-step lightness ramp in OKLCH (L from 0.98 to 0.15 in light mode, inverted in dark), chroma 0 to 0.04 depending on neutralTintStrength, hue = neutralTint. OKLCH lightness is perceptually uniform, so steps look even and contrast is predictable.
2. **Accent scale.** From accentHue + chroma level, generate a 5-step accent ramp, gamut-mapped to sRGB.
3. **Contrast solving.** For every (text, surface) role pair, binary-search the text token's L until WCAG contrast meets the target (4.5 standard, 7 high, 3.5 floor for "soft" on large text only). This is solvable in OKLCH precisely because L maps to perceived lightness. Result: AA is guaranteed arithmetically, never checked-and-retried.
4. **Role assignment.** Map ramp steps to roles: surface-0/1/2 from neutral steps, text-primary/secondary contrast-solved against surface-1, accent-contrast solved against accent, border from a mid step.
5. **Non-color tokens.** radius/shadow/density/borderWeight map to fixed token tables (e.g., radius rounded = 12px base scale; shadow hard-offset = 4px 4px 0 black). Font pairing id resolves through the registry (1.6).
6. **Brand locks.** Any token the developer marked `locked` in config is passed through untouched, and the Compiler solves the rest of the theme *around* it (e.g., locked accent: neutrals and text adapt to the locked hue).

Output: a complete `theme.globals` role-token map. Same shape theme.json already stores.

### 1.6 Curated registries (taste as data, shipped with the framework)

LLMs are good at choosing from vetted options and bad at inventing typography from scratch. Ship two registries:

**Font pairing registry** (~30 entries, Google Fonts, all with sane fallback stacks):

```yaml
- id: retro-terminal
  display: 'VT323'
  body: 'Space Mono'
  tags: [retro, terminal, mono, playful]
- id: editorial-serif
  display: 'Playfair Display'
  body: 'Source Serif 4'
  tags: [editorial, elegant, classic]
- id: geo-grotesk
  display: 'Space Grotesk'
  body: 'Inter'
  tags: [modern, tech, neutral]
# ...
```

The Designer selects by id. The runtime injects the corresponding `<link>` (or @font-face) on demand and sets --inv-font-display/--inv-font-body. Developers can restrict the registry or add brand fonts in config.

**Theme pack presets** (~15 complete StyleSpecs with names): retro-arcade, neobrutalist, soft-pastel, terminal-green, glass-dark, editorial, corporate-trust, etc. Three uses: (a) few-shot examples in the Designer prompt, which is the single highest-leverage quality lever; (b) instant results when the user's request matches a pack ("make it brutalist" can skip straight to the pack plus small Designer adjustments); (c) the panel can show packs as one-tap starting points, so users see quality before typing anything.

### 1.7 Invariants, rewritten for creativity

The v5 default ("palette = exact observed hexes, everything locked") guarantees ugliness-by-stasis. v6 replaces value allowlists with **relational constraints** as the default, because the Compiler can satisfy relations while still being creative:

```yaml
design:
  constraints:
    contrast: ">= 4.5"             # enforced by Compiler construction + verify
    accent_chroma_max: 0.25        # no eye-searing neons unless dev raises it
    locked_tokens:                 # brand identity survives any theme
      --inv-accent: "#e94560"
    allowed_modes: [light, dark]
    font_registry: default         # or a restricted list / custom registry
  legacy_palette: [...]            # still supported for devs who want hard allowlists
```

The verification engine keeps every v5 test and adds: `styleSpecValid` (zod), `compilerOutputComplete` (every role token present), `lockedTokensUntouched`, `contrastPairs` (recomputed independently from the Compiler as the safety net), `fontInRegistry`.

### 1.8 Visual QA loop (dev/CI only, never runtime)

In Product Mode dev builds and in CI: after a theme compiles, Playwright screenshots the demo routes with the theme applied, and an optional vision-model check scores legibility and obvious breakage. This is a regression net for the Compiler and packs, not a runtime gate. Runtime stays deterministic and fast.

### 1.9 Model and API configuration

- **Gatekeeper:** fast small model (Haiku class), temp 0.1, structured outputs. Its job is classification; latency matters most.
- **Designer:** the strongest available Sonnet-class model, temp 0.7 (taste needs variance), structured outputs with the StyleSpec schema, system prompt containing: the pack library as few-shot, the role-token vocabulary, the developer's constraints, and explicit design principles (commit to a coherent direction; spend boldness in one place; typography carries personality; respect locked brand tokens).
- **Structured outputs everywhere.** Use the API's native JSON-schema output enforcement rather than prompt-and-parse. Eliminates malformed-JSON retries entirely. Keep raw fetch (no SDK), add the beta header the feature requires.
- **Slot-level F1 edits** ("make the sidebar blue") skip the Designer: Gatekeeper classifies intent and target, a small constrained call (or a deterministic nearest-token match against the current ramp) picks the value, Compiler-style contrast solving adjusts dependent text tokens of that slot. One coordinated micro-mutation, not one raw hex.

---

## Part 2: Hybrid Adoption

### 2.1 The funnel

```
Trial Mode (snippet)                      Product Mode (SDK + Scanner)
─────────────────────                     ────────────────────────────
1 script tag, 5 minutes                   npx invariance scan + npm install
Works on the rendered DOM                 Works in the source
F1 themes + hide sections only           F1-F4, governed, all users
Dev/stakeholders only (a preview)        Shipped to end users
Fragile by nature (disclosed)            Reliable by construction
        |                                          ^
        └──── export theme.json ──────────────────┘
              (role tokens port directly; slot tokens re-map after scan)
```

Trial Mode exists to make the first five minutes astonishing and to de-risk the Scanner decision: the developer sees their own app transformed before touching their repo. It is a sales motion implemented as software.

### 2.2 Trial Mode mechanics (invariance.js snippet)

What it is: a ~30KB script the developer drops on staging (never recommended for production). It is, deliberately, the Mirage mechanism applied first-party, with the same Designer/Compiler brain behind it:

1. **Browser-side mini-scan.** On load, walk the rendered DOM, read computed styles, cluster colors/fonts/radii into inferred semantic roles (same role vocabulary as the SDK). No LLM needed for clustering; one optional API call refines role naming.
2. **Virtual token map.** Build a stylesheet that maps inferred roles onto the page via generated selectors, then apply themes by swapping role values, exactly like the real system, just targeted by selector instead of by source-level var().
3. **Apply + persist.** Injected `<style>` with high-specificity rules; MutationObserver re-applies on SPA re-render; theme stored in localStorage keyed by origin.
4. **The bridge.** "Export" produces a theme.json whose role tier is fully portable. After the developer runs the Scanner, the same file drops in as the initial theme and the trial look becomes the real, governed look.

Honest limitations, stated in the product: flicker on load, can fight client-side re-renders, breaks on redeploys, F1 + crude hide only, per-browser persistence. These are not bugs to fix; they are the demonstration of why Product Mode exists.

### 2.3 Product Mode (the actual product)

As v5, plus v6 changes:

- `npx invariance scan` inserts wrappers, rewrites values to var(--inv-*), and now also emits the role tier with slot tokens referencing roles (1.3).
- Runtime is render-driven: provider holds theme.json; `m.text` renders override text from context; the page-level layout component renders section order/visibility from context; `m.slot` keeps F4 swaps and registration. `apply-theme.ts` remains (writing :root is correct for CSS variables, ideally inlined server-side to avoid any flash). `apply-content.ts` and `apply-layout.ts` are deleted.
- `npx invariance check` runs in the developer's CI: fails if hardcoded style values appear inside wrapped slots, or if registered tokens/slots vanish without a migration entry.
- Version migrations: theme.json's base_app_version gates an automatic carry-forward (same-named tokens keep user values; removed tokens drop with a report; renames map via an optional file). User customizations degrade to defaults, never to a broken page.

### 2.4 SDK + Scanner vs injection: the explicit comparison

| Dimension | Injection (snippet/extension) | SDK + Scanner |
|---|---|---|
| Adoption cost | Paste one tag, minutes | CLI run + reviewed diff + npm install |
| Survives React re-renders | No; needs MutationObserver loops, flicker, races | Yes; changes ARE the render |
| Survives developer deploys | No; selectors/classes break every build | Yes; tokens live in source, refactors carry them |
| Ground truth about the app | None; inferred from rendered pixels | Full; extracted from source, locked in config |
| Invariant enforcement | Best-effort guessing | Deterministic against real constraints |
| F1 styles | Yes (fragile) | Yes (guaranteed) |
| F2 content | Partial, revert-prone | Yes, render-driven |
| F3 layout | Crude hide; reorder fights reconciliation | Yes, render-driven |
| F4 component swap | Impossible (components not in the page) | Yes (library behind the SDK) |
| F5+ behavior/features | Impossible | The roadmap |
| SSR / first paint | Always flashes default first | Theme applied at/before first paint |
| Reach | Only where the script runs (or per-user installs) | 100% of the app's users |
| Who it serves | A demo, a power user's hack (Mirage) | A developer shipping a product feature |

One sentence for the deck: injection rearranges pixels after the fact; the SDK makes customization a property of the application itself. Mirage proves the demand from the hostile end; Invariance is what the app owner ships on purpose, with guarantees Mirage structurally cannot make ("won't break" as architecture, not aspiration).

---

## Part 3: Pipeline, Schema, and Runtime Changes (delta from v5)

### theme.json (v2 schema)

```json
{
  "version": 2,
  "base_app_version": "v1",
  "theme": {
    "roles": {
      "--inv-surface-0": "#0f1117",
      "--inv-text-primary": "#f2f3f5",
      "--inv-accent": "#e94560",
      "--inv-font-display": "VT323",
      "--inv-radius-base": "2px"
    },
    "slots": {
      "--inv-sidebar-bg": "var(--inv-surface-1)",
      "--inv-header-bg": "#123456"
    },
    "styleSpec": { "...": "the StyleSpec that produced roles, for provenance/undo" }
  },
  "content": { "pages": { "/dashboard": { "el_003": { "text": "My Pipeline" } } } },
  "layout":  { "pages": { "/dashboard": { "sections": ["hero", "deals-grid"], "hidden": ["banner"] } } },
  "components": { "pages": { "/dashboard": { "chart-area": { "component": "LineChart" } } } }
}
```

Notes: `theme.globals` from v1 migrates into `roles` + `slots` (a pure key-partition; loader accepts v1 and upgrades). Slot values may be `var(...)` references or literals. The old inline-style `theme.slots` object (CSS property maps) is removed along with its Builder fallback and the childCss/!important machinery in m.slot.

### Pipeline routing

```
request -> Gatekeeper -> { THEME    -> Designer -> Compiler -> verify -> store/apply
                           SLOT_F1  -> micro-mutation (constrained pick + contrast solve)
                           F2/F3/F4 -> Builder (as v5, structured outputs)
                           CLARIFY / REJECT }
```

LLM calls per request: 2 for themes (Gatekeeper + Designer), 1 to 2 otherwise. Verification failures retry the producing stage with violation details, max 2, unchanged from v5.

### Runtime

- F1: write role + slot tokens to :root (client) and inline them in SSR HTML (Next.js: a small server helper renders the :root block from the stored theme so first paint is themed).
- F2: `m.text` returns the override from context, falling back to children.
- F3: `m.page` (or a new `m.sections` helper) renders children ordered/filtered per layout config; slots carry stable section keys.
- F4: unchanged.

---

## Part 4: What Success Looks Like

- "make it more retro" on the demo produces a theme a designer would not flinch at: coherent retro palette with correct neutrals, VT323/Space Mono pairing, sharp radii, hard-offset shadows, AA contrast everywhere, applied in under 8 seconds, undoable in one click.
- Ten consecutive vibe requests (retro, brutalist, pastel, terminal, glassy, editorial, ocean, sunset, mono, corporate) produce ten distinct, coherent, accessible themes with zero verification failures, because the Compiler cannot emit one.
- "make the sidebar blue" changes the sidebar and auto-adjusts its text contrast, touching nothing else.
- The snippet on an unmodified copy of the demo produces a recognizable preview of the same retro theme, and its exported theme.json round-trips into the SDK after scanning.
- A simulated "developer deploy" (rename a component file, restyle an unwrapped element) breaks nothing; `invariance check` catches a removed slot before merge.

## Deferred

Review UI, F5+ code path, blob storage, B-levels, per-slot palette constraints, vision-QA as a runtime gate, theme marketplace/sharing (the Mirage-style share link is a natural later feature on top of theme.json).
