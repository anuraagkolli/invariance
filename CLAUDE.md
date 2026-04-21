# CLAUDE.md -- Invariance v4

## Project Overview

Invariance is a developer framework that makes existing React/Next.js apps customizable by end-users. Developers migrate their existing app using the Scanner CLI (one-time), which wraps components with `m.page`/`m.slot`/`m.text` primitives and rewrites hardcoded style values to CSS variable references. The framework then provides a natural language customization interface backed by a two-agent pipeline (Gatekeeper -> Builder), deterministic verification tests, per-user storage, and runtime application of changes via CSS variables.

F1-F4 changes (style, content, layout, component swap) are stored as a `theme.json` config file per user. F1 styles work through `--inv-*` CSS variables on `:root`, not inline styles on wrapper divs. No code rewriting or transpilation at runtime.

### Core Thesis

Developers define **invariants** (constraints that must always hold) and **unlock levels** (what's customizable). Users describe changes in natural language. Two agents always run on every request: the Gatekeeper classifies intent and enforces level boundaries, the Builder produces the actual change (theme.json mutation targeting `--inv-*` CSS variables for F1-F4). Deterministic tests verify invariants before changes are applied. Every user gets their own versioned config.

### How F1 Styles Work

The Scanner rewrites hardcoded values to CSS variable references during migration:
```tsx
// Before:  <aside className="bg-[#1a1a2e]">
// After:   <aside className="bg-[var(--inv-sidebar-bg)]">
```
theme.json stores: `{ "theme": { "globals": { "--inv-sidebar-bg": "#1a1a2e" } } }`
Runtime writes `--inv-sidebar-bg` to `:root`. Component picks it up via `var()`.

The `--inv-` prefix is configurable via `config.theme_prefix` (default `--inv-`). Projects with an existing design-token namespace can alias (e.g. `theme_prefix: "--fl-"`) without touching core code — enables future scale to apps that already ship design tokens.

To customize: Builder outputs `{ "--inv-sidebar-bg": "#1b2a4a" }`. Runtime updates `:root`. Sidebar repaints. No inline-style patching, no code rewriting.

### How It Works

```
Migration (one-time):
  npx invariance scan ./apps/my-app --apply
  -> Wrappers inserted, hardcoded values -> var(--inv-*), config generated locked

Runtime (per user request):
  User: "make the sidebar dark blue"
      |
      v
  Gatekeeper (LLM) -- classifies intent, validates level
      |
      v
  Builder (LLM) -- produces theme.json mutation targeting --inv-* vars
      |
      v
  Verification (deterministic tests) -- no LLM
      |  fail? -> retry Builder (max 2)
      v
  Store + Apply -- save theme.json, write --inv-* to :root
```

---

## Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Language | TypeScript (strict mode) | Type safety |
| Target apps | React 18+ / Next.js 14+ | Most common frontend stack |
| Package manager | pnpm only | Do not use npm or yarn |
| Monorepo | pnpm workspaces + turborepo | Multi-package project |
| Config format | YAML parsed with `js-yaml`, validated with `zod` | Human-readable |
| LLM | Anthropic API via raw fetch (no SDK) | Gatekeeper + Builder: `claude-sonnet-4-6`. Scanner naming: `claude-opus-4-7`. |
| Verification | Deterministic test functions (pure TS) | No LLM in verification |
| Scanner | ts-morph (AST), tailwindcss/resolveConfig | Source analysis + rewriting |
| Testing | vitest (unit) | Fast unit tests |

---

## Directory Structure

```
invariance/
├── CLAUDE.md
├── DESIGN.md
├── package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json
│
├── packages/
│   ├── core/                        # invariance (main package)
│   │   └── src/
│   │       ├── index.ts
│   │       ├── primitives/
│   │       │   ├── page.tsx         # m.page wrapper
│   │       │   ├── slot.tsx         # m.slot: F3 layout + F4 swap + cssVariables prop
│   │       │   ├── text.tsx         # m.text wrapper
│   │       │   └── error-boundary.tsx
│   │       ├── config/
│   │       │   ├── types.ts         # InvarianceConfig.theme_prefix, ThemeGlobals via index sig
│   │       │   ├── schema.ts        # .catchall(z.string()) for CSS var keys; theme_prefix validation
│   │       │   └── parser.ts        # YAML config parser
│   │       ├── context/
│   │       │   ├── provider.tsx     # InvarianceProvider
│   │       │   ├── theme-store.ts   # In-memory theme.json state
│   │       │   └── registry.ts      # SlotRegistration: cssVariables?, source?: 'page'|'component'
│   │       ├── storage/
│   │       │   ├── types.ts, memory.ts, local-storage.ts, api.ts
│   │       ├── agent/
│   │       │   ├── gatekeeper.ts    # Classifies intent, validates level
│   │       │   ├── builder.ts       # Produces --inv-* mutations from slot's cssVariables
│   │       │   └── pipeline.ts      # Gatekeeper -> Builder -> Verify -> Store
│   │       ├── verify/
│   │       │   ├── engine.ts, types.ts
│   │       │   ├── theme-tests.ts   # Walks --inv-* entries for palette/font checks
│   │       │   ├── content-tests.ts, layout-tests.ts, component-tests.ts, utils.ts
│   │       │   ├── *.test.ts        # Vitest unit tests (84 tests)
│   │       │   └── __fixtures__/    # mockConfig / mockTheme / mockSlot factories
│   │       ├── runtime/
│   │       │   ├── apply-theme.ts   # Writes themePrefix-keyed vars to :root (default --inv-)
│   │       │   ├── apply-content.ts, apply-layout.ts, apply.ts
│   │       ├── panel/
│   │       │   ├── trigger-button.tsx, customization-overlay.tsx, customization-panel.tsx
│   │       ├── levels/index.ts
│   │       └── utils/errors.ts
│   │
│   │       ├── scanner/             # Migration CLI code, shipped in the same npm package
│   │       │   ├── discover.ts      # Find pages/routes, tsconfig, tailwind config
│   │       │   ├── ast/             # ts-morph: parse, extract-structure/colors/fonts/spacing/text
│   │       │   ├── tailwind/resolve.ts
│   │       │   ├── agent/scanner-agent.ts # LLM for semantic naming only (pluggable)
│   │       │   ├── plan/            # slot-plan, text-plan, build-plan
│   │       │   ├── emit/            # config-emitter, source-rewriter, variable-rewriter, provider-injector
│   │       │   ├── unlock/          # Level adjustment logic used by `invariance unlock`
│   │       │   ├── cli/             # scan.ts, unlock.ts, init.ts, dispatch.ts (run(argv) helpers)
│   │       │   ├── migrate.ts       # Orchestrator: exports migrate / analyze / writeMigration
│   │       │   └── __fixtures__/    # simple-app + already-migrated for e2e migrate() tests
│   │       ├── primitives/, config/, context/, storage/, agent/, verify/, runtime/, panel/, levels/, utils/
│   │   └── bin/invariance.ts        # Single CLI entrypoint: `invariance {init|scan|unlock}`
│   │
│   └── verify/                      # Playwright, CI only (F5+ future)
│
├── apps/demo/
│   ├── invariance.config.yaml       # Invariant definitions (generated by scanner)
│   ├── invariance.theme.initial.json # Scanner-generated initial theme (original values)
│   └── src/ ...
│       ├── app/providers.tsx        # InvarianceProvider + CustomizationPanel (generated)
│       └── ...
│
│   NOTE: branch `demo-clean` holds the unintegrated React app (no Invariance).
│         Run the scanner against it to test migration end-to-end.
```

---

## Coding Conventions

- TypeScript `strict: true`, named exports only
- `interface` for extendable shapes, `type` for unions/computed
- `async/await` only, no `.then()` chains
- No `any` (use `unknown` + type guards), no semicolons, single quotes
- `kebab-case.ts` files, colocated tests (`thing.test.ts`)
- Comments explain *why*, not *what*
- Import order: node builtins > external > internal > relative (blank line between groups)

---

## Customization Levels

```
Level 0: Locked (no customization)
Level F1: Style (colors, fonts, spacing) -- theme.json globals --inv-* CSS vars
Level F2: Content (text, labels, images) -- theme.json content key
Level F3: Layout (reorder, show/hide) -- theme.json layout key
Level F4: Components (swap from approved library) -- theme.json components key
Level F5+: Pages, behavior, data (future, source code modification)
```

F1-F4 are config-only. No code rewriting at runtime.

---

## theme.json

Single file per user. `theme.globals` holds `--inv-*` CSS variable keys (generated by scanner) plus optional structured tokens.

```json
{
  "version": 1,
  "base_app_version": "v1",
  "theme": {
    "globals": {
      "--inv-sidebar-bg": "#1a1a2e",
      "--inv-sidebar-text": "#ffffff",
      "--inv-header-bg": "#ffffff",
      "--inv-header-border": "#e5e7eb"
    }
  },
  "content": { "pages": { "/dashboard": { "el_003": { "text": "My Pipeline" } } } },
  "layout": { "pages": { "/dashboard": { "sections": ["hero", "deals-grid", "footer"], "hidden": ["announcements-banner"] } } },
  "components": { "pages": { "/dashboard": { "chart-area": { "component": "LineChart" } } } }
}
```

When no saved theme exists for a user, the runtime loads `invariance.theme.initial.json` (the scanner-generated default with original values).

`initialTheme` is exposed in the `InvarianceContext` so the customization panel's "Reset all" handler re-applies it (restoring all `--inv-*` CSS variables to their original values) rather than wiping variables and leaving the page unstyled.

---

## The Wrapper Primitives

### m.page

Registers a page. Renders: `<div data-inv-page={name}>{children}</div>`

### m.slot

Primary primitive. NOT responsible for F1 styles (those work via CSS variables on `:root`). Responsible for:
- `data-inv-slot`, `data-inv-section`, `data-inv-level` attributes for F3 layout
- F4 component swaps from registered library
- `cssVariables` prop: tells the registry which `--inv-*` vars belong to this slot, so the Builder knows what to target

Props: `name`, `level`, `children`, `props?`, `preserve?`, `cssVariables?`, `description?`, `aliases?`, `source?` (`'page'` | `'component'`, default `'page'` — reserved for future component-library scans).

### m.text

Content replacement hook. Renders: `<span data-inv-text={name} data-inv-id={name}>{text}</span>`

---

## Agent Pipeline

### Gatekeeper

Classifies intent, validates level. Never produces mutations.
Output: `{ type: 'intent', slotName, level, description, requirements }` | clarification | error
API: `claude-sonnet-4-6`, temp 0.2, max_tokens 1024, JSON-only.

### Builder

Produces the actual change. For F1: mutations targeting `--inv-*` keys from the slot's `cssVariables` list. Receives slot registry so it knows valid variable names.
Output: `{ mutation: Partial<ThemeJson>, explanation: string }`
API: `claude-sonnet-4-6`, temp 0.2, max_tokens 4096, JSON-only.

### Pipeline

Gatekeeper -> Builder -> merge -> verify -> (retry Builder if fail, max 2) -> store + apply.
2-4 LLM calls per request. Retries go to Builder only (intent doesn't change).

---

## Verification Engine

Deterministic test functions. No LLM.

**F1:** `colorInPalette` (walks --inv-* hex values), `contrastRatio`, `fontInAllowlist`, `validHexColors`, `cssVarExists`
**F2:** `textNonEmpty`, `noXssVectors`, `imagesHaveAlt`
**F3:** `requiredElementsPresent`, `orderConstraints`, `lockedSectionsUntouched`
**F4:** `componentInLibrary`, `propsCompatible`, `preservedSlotsNotSwapped`

---

## Runtime

- **F1:** `apply-theme.ts` writes `--inv-*` entries from `theme.globals` to `:root`. Components pick up via `var()`.
- **F2:** Elements with `data-inv-id` get text/image replaced.
- **F3:** Sections with `data-inv-section` get reordered/hidden.
- **F4:** `m.slot` resolves component swap from library.

---

## Storage

```typescript
interface StorageBackend {
  loadTheme(userId: string, appId: string): Promise<ThemeJson | null>
  saveTheme(userId: string, appId: string, theme: ThemeJson): Promise<void>
  getVersion(userId: string, appId: string): Promise<number>
}
```

Backends: memory, localStorage, api (REST to developer endpoint).

---

## Scanner (Migration Tool)

One-time CLI. Ships as the `invariance` bin from the single `invariance` package.

```bash
# For end users (after `npm install invariance`):
npx invariance init ./my-next-app                 # migrate + wire providers
npx invariance scan ./my-next-app                 # dry-run only
npx invariance scan ./my-next-app --apply         # same as init but without idempotency check
npx invariance unlock --status                    # inspect current lock state

# From this monorepo during dev:
pnpm --filter invariance run build
node packages/core/dist/bin/invariance.js init ./apps/demo
```

Pipeline: Discover -> Extract (AST/ts-morph) -> Semantic Analysis (LLM, 1/page, naming only) -> Plan -> Validate -> Emit

Two-pass source rewriting:
1. Insert `m.page`/`m.slot`/`m.text` wrappers
2. Replace hardcoded colors/fonts/spacing with `var(--inv-{slot}-{property})`

Output: `invariance.config.yaml` (locked), `invariance.theme.initial.json` (original values), modified source, `.invariance-migration-report.md`.

**Semantic naming** requires `ANTHROPIC_API_KEY` in env — uses `claude-opus-4-7` (no extended thinking). Without it, falls back to generic `section-1`, `text-1` names. Set `NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY` or `ANTHROPIC_API_KEY` before running.

Variable naming: `--inv-{slot}-{property}` (e.g., `--inv-sidebar-bg`, `--inv-header-border`). Short role aliases: bg, text, border, font, pad, radius. Collision suffix (-1, -2) applied when a slot has multiple values for the same role.

Dry-run by default. `--apply` to write files. Re-running on an already-migrated app is blocked (scanner detects `from 'invariance'` imports and `var(--inv-*)` references and throws).

**Public API** — subpath export `invariance/scanner` (source at [packages/core/src/scanner/index.ts](packages/core/src/scanner/index.ts)):
- `migrate(opts)` — full pipeline, writes to disk unless `dryRun: true`.
- `analyze(opts)` — pure analysis: discover → extract → plan → apply edits in-memory. Returns an `AnalyzeResult` with the mutated ts-morph Project. No disk writes. Use for inspection, caching, or incremental re-scans.
- `writeMigration(result)` — commits an `AnalyzeResult` to disk (source edits, config, initial theme, provider injection, `.env.example`).
- `ScannerAgent` — the semantic-naming function type. `MigrateOptions.agent` overrides the default LLM agent; tests inject a stub to run end-to-end without an API key.

---

## Invariant Config

```yaml
app: "acme-crm"
frontend:
  design:
    colors:
      mode: "palette"
      palette: ["#e94560", "#0078d4", "#1a1a2e", "#ffffff"]
    fonts:
      allowed: ["Inter", "system-ui"]
    spacing:
      scale: [0, 4, 8, 12, 16, 24, 32, 48, 64]
  structure:
    required_sections: ["header", "main-content", "footer"]
    locked_sections: ["auth-gate"]
    section_order: { first: "header", last: "footer" }
  accessibility:
    wcag_level: "AA"
    color_contrast: ">= 4.5"
    all_images: "must have alt text"
  pages:
    "/dashboard": { level: 4, required: ["deals-view", "activity-feed"] }
    "/settings": { level: 1 }
```

After scanner migration: all pages level 0, palette = exact observed colors, all sections locked. Developer unlocks by editing.

---

## Dependencies by Package

### packages/core (`invariance` on npm)
- `react`, `react-dom` (peer dep, optional — runtime only)
- `tailwindcss` (peer dep, optional)
- `ts-morph`, `zod`, `js-yaml` (dependencies — CLI needs ts-morph; runtime tree-shakes it out)
- `typescript`, `vitest`, `tsx` (dev)

### apps/demo
- `next` (14+), `react`, `react-dom`, `tailwindcss`
- `invariance` (workspace dep)

---

## Key Design Decisions

1. **CSS variables, not inline styles on wrapper divs.** Scanner rewrites source to use `var(--inv-*)`. Runtime sets values on `:root`. This means F1 changes actually reach the component's own elements, not just a wrapper.

2. **Both agents on every request.** Gatekeeper classifies. Builder produces. Clean separation even for tiny changes.

3. **No Judge agent.** Verification is deterministic test functions. No LLM in verification.

4. **Scanner as one-time migration.** Reads AST, LLM only names slots, outputs locked config + CSS-variable-wired source. App looks identical after migration.

5. **theme.json globals with --inv-* keys.** Builder targets named CSS variables from the slot's `cssVariables` list. No arbitrary CSS property injection.

6. **Store config, not compiled output.** theme.json is source of truth. Simple, serializable, diffable.

7. **No SDK dependency for Anthropic.** Raw fetch.

8. **Panel uses inline styles only.** Works in any React app.

9. **Seams for scale, not features for scale.** The MVP is page-scoped with LLM naming, but four seams keep the door open for enterprise-sized apps: (a) `ScannerAgent` is pluggable, (b) `SlotRegistration.source` distinguishes page vs component slots, (c) `config.theme_prefix` aliases the CSS-var namespace, (d) `analyze()` / `writeMigration()` split lets plans be cached and re-applied. None of these add complexity today; they prevent painful retrofits later.

---

## Testing

Both packages use vitest. Tests colocated as `*.test.ts` next to source files.

- `pnpm test` at repo root runs both suites via turbo.
- `pnpm --filter invariance test` — 84 tests covering verify engine (F1-F4) and pure helpers.
- Scanner tests live under `packages/core/src/scanner/**/*.test.ts` and ship as part of the same vitest run. They cover pure planning, AST extractors, rewriters, the provider-injector, and a golden-fixture end-to-end `migrate()` run.
- **All tests run without `ANTHROPIC_API_KEY`.** The scanner E2E test uses `MigrateOptions.agent` to inject a deterministic stub in place of the LLM.

Every `ObservedValue` carries the jsxPath of the JSX element it was observed on. Slot-plan attaches each value to the smallest enclosing slot by prefix match, so sibling values stay isolated (the sidebar's bg does not leak to main and vice versa).

---

## Phase 1 Scope

Build: config parser, theme.json schema, verification engine, Gatekeeper, Builder, pipeline, runtime appliers, m.slot/m.page/m.text, storage backends, customization panel, scanner CLI, demo app.

### What's Deferred

- Review UI (developer overlay for unlocking)
- F5+ code path (Builder writing source, Sucrase)
- Content-addressed blob storage
- Invariant change pipeline
- Backend levels (B1-B6)
- Per-slot palette constraints
