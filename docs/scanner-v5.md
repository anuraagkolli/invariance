# Scanner Agent — Migration Tool for Existing React/Next.js Apps



## Context



Invariance's Phase 1 assumes developers wrap components by hand with `m.page`, `m.slot`, `m.text`. In reality, most adopters will have an existing app and want to bolt Invariance on top. The Scanner is a **one-time migration tool** that:



1. Reads an existing React/Next.js codebase.

2. Produces an `invariance.config.yaml` where **everything starts locked** to the developer's current design choices (the sidebar's exact blue, the exact fonts, the exact spacing values, the exact section order).

3. Inserts `m.page` / `m.slot` / `m.text` wrappers into the source so the framework has something to hook into.

4. Never runs again after migration. The dev then loosens constraints manually (or via a future overlay UI) to decide what end-users can actually customize.



The output config must be in the **existing `InvarianceConfigSchema` format** (`packages/core/src/config/schema.ts`) so the Gatekeeper can consume it without modification.



---



## Guiding Principles



1. **"Locked to observed"** — the initial invariant set is whatever the scanner literally sees in the code. Palette = exact hexes detected. Fonts = exact fonts used. Spacing scale = exact spacing values used. `pages.*.level = 0`.

2. **Dev is always in the loop** — scanner never silently rewrites source. It produces a diff + report; dev approves.

3. **Hybrid static + LLM** — AST extraction is deterministic (colors, fonts, structure). LLM is only used for *semantic naming* ("this top-level `<nav>` is the sidebar") and slot boundary decisions.

4. **One-shot tool** — scanner is CLI-only and not shipped in the runtime bundle. It lives in its own package so production apps never pull it in.

5. **Reuse existing schemas and parser** — no new YAML dialect. Output goes through `InvarianceConfigSchema.safeParse()` before being written.

6. **Wire code to the theme store via CSS variables, not runtime inline-style overrides.** During migration, the scanner rewrites every hardcoded color / font / spacing in the source to a `var(--inv-{slot}-{property})` reference. The original value becomes the initial value of that variable in `theme.globals`. After migration, F1 customization means updating those named variables on `:root` — not patching inline styles through `m.slot`. See "CSS Variable Rewriting" below.



---



## Architecture



### New Package: `packages/scanner` (invariance-scanner)



CLI-only. Not a peer dep. Depends on `invariance` (core) for types and schema validation.



```

packages/scanner/

├── package.json

├── tsconfig.json

├── bin/

│   └── invariance-scan.ts            # CLI entry (pnpm invariance scan ./apps/my-app)

└── src/

    ├── index.ts

    ├── discover.ts                   # Find Next.js pages/routes, component files

    ├── ast/

    │   ├── parse.ts                  # ts-morph wrapper — load project, walk JSX

    │   ├── extract-structure.ts      # Top-level section tree per page

    │   ├── extract-colors.ts         # Hex/rgb/Tailwind class → hex

    │   ├── extract-fonts.ts          # font-family, Next.js font imports

    │   ├── extract-spacing.ts        # Tailwind spacing classes, inline styles

    │   └── extract-text.ts           # JSX text nodes (F2 candidates)

    ├── tailwind/

    │   └── resolve.ts                # tailwindcss/resolveConfig → class→value map

    ├── agent/

    │   └── scanner-agent.ts          # LLM call (raw fetch, same pattern as gatekeeper.ts)

    ├── plan/

    │   ├── slot-plan.ts              # Decide: wrap this node? name? level?

    │   └── text-plan.ts              # Which text nodes to wrap in m.text

    ├── emit/

    │   ├── config-emitter.ts         # Writes invariance.config.yaml

    │   ├── source-rewriter.ts        # Inserts m.page/m.slot/m.text via ts-morph

    │   ├── variable-rewriter.ts      # Replaces hardcoded colors/fonts/spacing with var(--inv-*)

    │   ├── variable-naming.ts        # Generates --inv-{slot}-{property} names deterministically

    │   └── report.ts                 # Markdown migration report

    └── migrate.ts                    # Top-level orchestrator

```



### Pipeline



```

invariance-scan <app-path> [--dry-run] [--interactive]

        │

        ▼

┌─────────────────────────────────────────────────────────────┐

│ 1. DISCOVER (deterministic)                                 │

│    - Find Next.js app/pages directories                     │

│    - Resolve tsconfig paths                                 │

│    - Load tailwind.config.* if present                      │

└─────────────────────────────────────────────────────────────┘

        │

        ▼

┌─────────────────────────────────────────────────────────────┐

│ 2. EXTRACT (deterministic, AST-only)                        │

│    For each page component:                                 │

│      - Build section tree (top-level JSX children)          │

│      - Collect every color literal / Tailwind color class   │

│      - Collect every font-family / Next font import         │

│      - Collect every spacing class / inline px value        │

│      - Collect every raw JSX text node + location           │

│    Result: StaticExtraction per page                        │

└─────────────────────────────────────────────────────────────┘

        │

        ▼

┌─────────────────────────────────────────────────────────────┐

│ 3. SEMANTIC ANALYSIS (LLM, 1 call per page)                 │

│    Input: section tree (pruned JSX) + component file paths  │

│    Output (JSON):                                           │

│      {                                                      │

│        "page": "/dashboard",                                 │

│        "slots": [                                           │

│          { "name":"sidebar", "level":0,                     │

│            "file":"src/components/Sidebar.tsx",             │

│            "jsxPath":"nav", "preserve":true },              │

│          ...                                                │

│        ],                                                    │

│        "texts": [                                           │

│          { "name":"page-title", "file":"...", "line":12 }   │

│        ],                                                    │

│        "sectionOrder": ["header","main","footer"]           │

│      }                                                       │

│    Scanner LLM is ONLY semantic — never picks colors/fonts. │

└─────────────────────────────────────────────────────────────┘

        │

        ▼

┌─────────────────────────────────────────────────────────────┐

│ 4. PLAN (deterministic merge)                               │

│    Merge StaticExtraction + SemanticResult into a           │

│    MigrationPlan:                                           │

│      - config: InvarianceConfig (locked)                    │

│      - sourceEdits: list of {file, insertion} tuples        │

│      - warnings: ambiguous slots, unnamed sections, etc.    │

└─────────────────────────────────────────────────────────────┘

        │

        ▼

┌─────────────────────────────────────────────────────────────┐

│ 5. VALIDATE                                                 │

│    - Run config through InvarianceConfigSchema.safeParse()  │

│    - Reject plan if schema fails (report to dev)            │

└─────────────────────────────────────────────────────────────┘

        │

        ▼

┌─────────────────────────────────────────────────────────────┐

│ 6. EMIT                                                     │

│    - --dry-run: print diff + report only                    │

│    - default: write invariance.config.yaml,                 │

│      rewrite .tsx files, write migration-report.md          │

└─────────────────────────────────────────────────────────────┘

```



**LLM calls total:** 1 per page (not per slot). No retries — if the LLM output fails schema validation, the scanner falls back to deterministic naming (`section-1`, `section-2`) and logs a warning.



---



## How the Migration Output Ties to theme.json



The scanner emits **two** coordinated outputs: the YAML invariant config (read by the Gatekeeper) and an initial `theme.json` containing the CSS-variable initial values (read by the runtime on first render).



### `invariance.config.yaml` (unchanged schema — no core changes)



```yaml

app: "<inferred from package.json name>"



frontend:

  design:

    colors:

      mode: "palette"

      palette: ["#1b2a4a", "#e94560", "#ffffff", ...]   # exact hexes observed

    fonts:

      allowed: ["Inter"]                                 # exact fonts observed

    spacing:

      scale: [0, 4, 8, 16, 24]                          # exact spacing values observed

  structure:

    required_sections: ["header", "sidebar", "main", "footer"]

    locked_sections: ["header", "sidebar", "main", "footer"]  # all locked initially

    section_order: { first: "header", last: "footer" }

  accessibility:

    wcag_level: "AA"

    color_contrast: ">= 4.5"

    all_images: "must have alt text"

  pages:

    "/": { level: 0, required: ["sidebar","header","main","footer"] }

```



### Initial `theme.json` (written as the default/fallback theme for the app)



Every generated CSS variable is declared in `theme.globals` with its original observed value:



```json

{

  "version": 1,

  "base_app_version": "v1",

  "theme": {

    "globals": {

      "--inv-sidebar-bg":       "#1a1a2e",

      "--inv-sidebar-text":     "#ffffff",

      "--inv-sidebar-font":     "Inter, system-ui",

      "--inv-header-bg":        "#ffffff",

      "--inv-header-border":    "#e5e7eb",

      "--inv-metric-card-pad":  "16px",

      "..."

    }

  }

}

```



Because the source now reads `var(--inv-sidebar-bg)`, rendering the app with this theme reproduces the original design exactly — zero visual diff after migration.



**Unlocking flow (post-migration, done by the dev manually or via future overlay UI):**

- Allow sidebar recoloring → raise `pages."/".level` to `1`, add more hexes to `palette`, remove `sidebar` from `locked_sections`. User says "make sidebar dark blue" → Builder emits `{ "theme": { "globals": { "--inv-sidebar-bg": "#1b2a4a" } } }`. Runtime writes the new value to `:root`. The `<aside>` picks it up automatically through the `var()` reference the scanner baked in.

- Allow text edits → raise `level` to `2` (unchanged path — F2 still uses `data-inv-id` + DOM replacement).

- Allow layout changes → raise `level` to `3` (unchanged path — F3 still uses `data-inv-section` reordering).



---



## Implications for `packages/core` (out-of-scope but required)



The CSS-variable rewriting design means the runtime stops using `theme.slots` inline-style overrides for F1. This requires **small but load-bearing changes in core** that must land *alongside* the scanner, even though they're outside `packages/scanner`:



1. **`packages/core/src/runtime/apply-theme.ts`** — currently injects a fixed set of `--inv-*` variables (`--inv-color-*`, `--inv-font-*`, etc.) from `theme.globals.colors/fonts/…`. Must be extended to also accept **arbitrary `--inv-*` keys** in `theme.globals` and write them verbatim to `document.documentElement.style`. Backwards compatible: the old structured keys continue to work.



2. **`packages/core/src/config/types.ts` — `ThemeGlobals`** — widen to permit arbitrary `--inv-*` string keys alongside the existing structured ones (`colors`, `fonts`, `spacing`, `radii`). Likely: an index signature `[cssVar: \`--inv-${string}\`]: string`.



3. **`packages/core/src/config/schema.ts`** — mirror the type change in zod (`.catchall(z.string())` constrained to keys matching the pattern).



4. **`packages/core/src/primitives/slot.tsx`** — F1 inline-style application becomes a **no-op** (or remains only as a fallback for hand-wrapped slots not processed by the scanner). `m.slot`'s role narrows to F3 (layout/visibility/order) and F4 (component swap). The `data-inv-slot` / `data-inv-section` / `data-inv-level` attributes stay — F3 still needs them.



5. **`packages/core/src/agent/builder.ts`** — system prompt updated: for F1 requests, produce mutations targeting `theme.globals["--inv-{slot}-{property}"]` instead of `theme.slots[slot][cssProp]`. The Builder needs the list of available variable names as part of its input — they come from the scanner's output and are stored in the slot registry alongside each slot registration.



6. **`packages/core/src/context/registry.ts`** — `SlotRegistration` gains an optional `cssVariables?: string[]` field listing the variables rewritten into that slot's source. `m.slot` passes this through on mount (the scanner wires it by updating the `m.slot` call sites: `<m.slot name="sidebar" level={0} cssVariables={["--inv-sidebar-bg","--inv-sidebar-text"]}>`).



7. **`packages/core/src/verify/theme-tests.ts` — `colorInPalette`** — update to iterate `theme.globals`'s `--inv-*` entries (not just `theme.slots`) when validating against the palette.



These are all additive/narrowing changes. `theme.slots` is not deleted — it stays supported as a second-class fallback for F1 on slots that don't have CSS variables registered.



---



## Source Rewriting Strategy



Two passes, both via **ts-morph** (not raw Babel) so edits preserve formatting and TypeScript types.



### Pass 1 — Slot/text wrappers (`source-rewriter.ts`)



For each planned wrap:



1. Locate the JSX node by `{file, jsxPath}` from the SemanticResult.

2. Insert a JSX wrapper around it:

   - `m.page` at the page component's top-level return.

   - `m.slot name="..." level={0}` around identified sections.

   - `m.text name="..."` around identified text literals.

3. Add `import { m } from 'invariance'` at the top of any modified file (if not already present).



### Pass 2 — CSS variable rewriting (`variable-rewriter.ts`)



For every hardcoded design value observed inside a wrapped slot, replace it with a `var(--inv-{slot}-{property})` reference. The *same* ts-morph source files are further mutated in this pass.



Handles these shapes:



**Inline styles:**

```tsx

// Before

<aside style={{ backgroundColor: '#1a1a2e', color: '#ffffff' }}>

// After

<aside style={{ backgroundColor: 'var(--inv-sidebar-bg)', color: 'var(--inv-sidebar-text)' }}>

```



**Tailwind arbitrary values:**

```tsx

// Before

<aside className="bg-[#1a1a2e] text-white font-sans">

// After

<aside className="bg-[var(--inv-sidebar-bg)] text-[var(--inv-sidebar-text)] font-[var(--inv-sidebar-font)]">

```



**Tailwind named classes (e.g. `bg-blue-900`):**

These are resolved to hex via `tailwind/resolve.ts` during extraction. The rewriter replaces the named class with its arbitrary-value form (`bg-[var(--inv-sidebar-bg)]`) so the variable hook exists. The migration report flags every such conversion so the dev can review.



### Naming rules (`variable-naming.ts`)



- Format: `--inv-{kebab-case-slot}-{kebab-case-property}` (e.g. `--inv-sidebar-bg`, `--inv-header-border-color`, `--inv-metric-card-padding`).

- Short aliases for common CSS props: `bg` (backgroundColor), `text` (color), `border` (borderColor), `font` (fontFamily), `pad` (padding), `radius` (borderRadius).

- Deterministic: same slot + same property → same variable name across runs.

- Collision handling: if two different values with the same semantic role are found in one slot (rare — e.g. two different bgs), suffix with `-1`, `-2` and list in the report.



### Write + format



After both passes, write files back; run `prettier` on changed files if available in the app.



### Safety



- Default is dry-run: prints a unified diff and writes `migration-report.md` to a temp location. Touches no source files.

- `--apply` flag required to actually write. Scanner never touches git.

- `migration-report.md` lists every edit, every detected color/font/spacing, every generated CSS variable, and every warning (unresolved class, naming collision, ambiguous slot).



---



## Scanner LLM Agent (`scanner-agent.ts`)



Follows the **exact same raw-fetch pattern** as `gatekeeper.ts` (`packages/core/src/agent/gatekeeper.ts`):



```typescript

fetch('https://api.anthropic.com/v1/messages', {

  headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', ... },

  body: JSON.stringify({

    model: 'claude-sonnet-4-20250514',

    max_tokens: 4096,

    temperature: 0.1,   // lower than gatekeeper — we want determinism

    system: SCANNER_SYSTEM_PROMPT,

    messages: [{ role: 'user', content: pagePayload }],

  }),

})

```



**Scanner system prompt responsibilities (narrow):**

- Given a pruned section tree + file paths, return JSON: slot names, which nodes to wrap, text node IDs, section order.

- **Forbidden from outputting**: colors, fonts, spacing values, CSS, or any mutation. Those come from the deterministic extractor.

- Output strict JSON (no markdown fences), same discipline as Gatekeeper/Builder.



**Why LLM here at all?** Naming is genuinely semantic — a `<nav>` on the left is a "sidebar", a `<div>` with metric cards is "metrics-grid", etc. Deterministic naming produces `section-1` / `section-2` which is unusable. The LLM is constrained to the naming/boundary task only.



---



## Critical Files to Create / Modify



**New (packages/scanner):**

- `packages/scanner/package.json` — deps: `ts-morph`, `js-yaml`, `tailwindcss` (peer), `invariance` (workspace)

- `packages/scanner/bin/invariance-scan.ts` — CLI entry

- `packages/scanner/src/**` — full implementation (see tree above), including `emit/variable-rewriter.ts` and `emit/variable-naming.ts`

- `apps/demo/invariance.config.yaml` — may be overwritten for smoke test

- `apps/demo/invariance.theme.initial.json` — initial theme emitted by the scanner (default theme loaded on first render for a new user)



**Modified in packages/core (required for CSS-variable model to work end-to-end):**

- `packages/core/src/config/types.ts` — widen `ThemeGlobals` to permit arbitrary `` [`--inv-${string}`]: string `` keys alongside the existing structured ones.

- `packages/core/src/config/schema.ts` — mirror via `.catchall(z.string())` with a regex key constraint.

- `packages/core/src/runtime/apply-theme.ts` — iterate arbitrary `--inv-*` keys in `theme.globals` and write each to `document.documentElement.style` verbatim. Keep existing structured-key handling for backward compatibility.

- `packages/core/src/primitives/slot.tsx` — add optional `cssVariables?: string[]` prop; store in registry. F1 inline-style application for `theme.slots` stays as a fallback only. F3 / F4 paths unchanged.

- `packages/core/src/context/registry.ts` — `SlotRegistration` gains `cssVariables?: string[]`.

- `packages/core/src/agent/builder.ts` — system prompt updated: for F1 intents, produce mutations targeting `theme.globals["--inv-..."]` keys drawn from the target slot's `cssVariables` list (passed in via the registry dump). `theme.slots` mutations become a deprecated fallback.

- `packages/core/src/verify/theme-tests.ts` — `colorInPalette` must now also walk `theme.globals` `--inv-*` entries when checking palette compliance.



**Reused (read-only):**

- `packages/core/src/config/parser.ts` — scanner's config emitter round-trips through this for validation.

- `packages/core/src/agent/gatekeeper.ts` — reference for raw fetch LLM pattern.



**Workspace wiring:**

- `pnpm-workspace.yaml` — add `packages/scanner`

- `turbo.json` — add scan task

- Root `package.json` — expose `pnpm scan` script



---



## Verification / Smoke Test



End-to-end test against `apps/demo`:



1. **Unwrap the demo** — create a branch where `Sidebar.tsx`, `Header.tsx`, `Dashboard.tsx`, `Footer.tsx` have all `m.*` wrappers removed AND all hardcoded hex/Tailwind values restored (simulating a fresh, un-migrated app).

2. Run `pnpm invariance scan ./apps/demo --apply=false` (dry-run). Confirm the diff:

   - Re-inserts `m.page` / `m.slot` / `m.text` wrappers matching the originals semantically

   - Rewrites every detected color/font/spacing to a `var(--inv-{slot}-{property})` reference

   - Adds `cssVariables={[...]}` to every `m.slot` call

3. Run with `--apply`. Confirm:

   - `invariance.config.yaml` has `palette` = exact hex set from the demo, `fonts.allowed = ["Inter"]`, all pages at `level: 0`

   - `invariance.theme.initial.json` has `theme.globals` populated with every `--inv-*` variable set to its original value

4. Start the demo (`pnpm --filter demo dev`). **Visual diff must be zero** — the CSS variables resolve to the original values on `:root`, so the page looks identical.

5. Open the customization panel → ask to change sidebar color → Gatekeeper should **reject** (level 0, locked).

6. Manually raise `pages."/".level` to `1` and add `#1b2a4a` to palette → ask "make sidebar dark blue":

   - Gatekeeper accepts

   - Builder emits `{ "theme": { "globals": { "--inv-sidebar-bg": "#1b2a4a" } } }`

   - Verification passes (`colorInPalette` walks `theme.globals` `--inv-*`)

   - `apply-theme.ts` writes the new value to `:root`

   - The `<aside>` repaints via the `var()` reference without any inline-style patching from `m.slot`



Unit tests (vitest) in `packages/scanner/src/**/*.test.ts`:

- `extract-colors.test.ts` — Tailwind class → hex resolution, inline style parsing

- `extract-structure.test.ts` — section tree from sample JSX fixtures

- `config-emitter.test.ts` — valid YAML round-trips through `parseConfig`

- `source-rewriter.test.ts` — ts-morph insertions preserve formatting

- `variable-rewriter.test.ts` — inline-style, `bg-[#...]`, and `bg-blue-900` all rewrite to `var(--inv-*)` form; original values end up in the emitted initial theme

- `variable-naming.test.ts` — deterministic naming + collision suffixing



Core-side tests that must also be updated:

- `packages/core/src/runtime/apply-theme.test.ts` — arbitrary `--inv-*` keys are written to `:root`

- `packages/core/src/verify/theme-tests.test.ts` — `colorInPalette` walks `theme.globals` CSS vars



---



## Resolved Design Decisions



1. **Global palette only.** No schema extension. Scanner emits a single global `palette` containing every hex observed anywhere in the app. Dev unlocks by raising `pages.*.level` and adding colors to `palette`. Gatekeeper requires zero changes. Per-slot overrides are explicitly rejected for Phase 1 — the scanner stays on the existing schema. Implication: the "sidebar can only be blue" example from the user's brief is enforced indirectly — at `level: 0` nothing changes, and when the dev raises the level they consciously expand the palette to include whatever alternates they want to allow.

2. **In-place source rewriting, dry-run by default.** `invariance-scan <path>` runs dry-run: prints a unified diff + writes `migration-report.md` to a temp location, touches no source. `invariance-scan <path> --apply` actually writes `.tsx` files and `invariance.config.yaml`. Scanner never touches git — committing is the dev's responsibility. This keeps the "measure twice, cut once" safety while avoiding the friction of a separate patch-apply step.

3. **Tailwind classes resolved to hex at scan time.** `packages/scanner/src/tailwind/resolve.ts` becomes a required module:

   - On startup, locate `tailwind.config.{ts,js,mjs,cjs}` in the target app.

   - If present: call `tailwindcss/resolveConfig` → flatten `theme.colors`, `theme.fontFamily`, `theme.spacing` into `{className → value}` maps.

   - If absent: extractor only understands hex/rgb literals and inline `style={{}}` values — log a warning for any unresolved class.

   - The extractor consults these maps whenever it sees a Tailwind utility class on a JSX element and records the *resolved* hex/font/spacing value, never the class name.

   - This keeps the runtime free of any Tailwind dependency and matches the inline-style model of `theme.slots`.

