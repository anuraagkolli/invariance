# CLAUDE.md -- Invariance v4

## Project Overview

Invariance is a developer framework that makes existing React/Next.js apps customizable by end-users. Developers wrap components with thin primitives (`m.page`, `m.slot`, `m.text`), define unlock levels and invariants per slot, and Invariance handles the rest: a natural language customization interface, a two-agent pipeline (Gatekeeper -> Builder), deterministic verification tests, per-user storage, and runtime application of changes.

F1-F4 changes (style, content, layout, component swap) are stored as a `theme.json` config file per user. No code rewriting, no transpilation. F5+ (future) involves actual source code modification.

### Core Thesis

Developers define **invariants** (constraints that must always hold) and **unlock levels** (what's customizable). Users describe changes in natural language. Two agents always run: the Gatekeeper classifies intent and enforces level boundaries, the Builder produces the actual change (theme.json mutation for F1-F4). Deterministic tests verify invariants before changes are applied. Every user gets their own versioned config.

### How It Works (F1-F4)

```
User types: "make the sidebar dark blue"
    |
    v
Gatekeeper (LLM) -- classifies intent, validates level
    |
    v
Builder (LLM) -- produces theme.json mutation
    |
    v
Verification (deterministic tests) -- no LLM
    |  fail? -> retry Builder (max 2)
    v
Store + Apply -- save theme.json, m.slot applies inline styles
```

Both agents run on every request, even small edits. The Gatekeeper never produces mutations. The Builder never decides if a request is allowed. Verification is never done by an LLM.

---

## Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Language | TypeScript (strict mode) | Type safety for wrapper API and agent pipeline |
| Target apps | React 18+ / Next.js 14+ | Most common frontend stack |
| Package manager | pnpm only | Do not use npm or yarn |
| Monorepo | pnpm workspaces + turborepo | Multi-package project |
| Config format | YAML parsed with `js-yaml`, validated with `zod` | Human-readable, supports comments |
| LLM | Anthropic API (Claude Sonnet) via raw fetch | Gatekeeper + Builder agents. No SDK. |
| Verification | Deterministic test functions (pure TS) | No LLM in verification loop |
| Testing | vitest (unit), Playwright (integration, F5+ only) | Fast unit tests, real browser for future levels |

**Not used in Phase 1:** Sucrase (only needed at F5+ for code transpilation), axe-core/Playwright verification (deferred).

---

## Directory Structure

```
invariance/
├── CLAUDE.md
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
│
├── packages/
│   ├── core/                        # invariance (main package)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts             # Public exports
│   │       ├── primitives/
│   │       │   ├── page.tsx         # m.page wrapper
│   │       │   ├── slot.tsx         # m.slot (applies per-slot styles, handles F4 swaps)
│   │       │   ├── text.tsx         # m.text wrapper
│   │       │   └── error-boundary.tsx
│   │       ├── config/
│   │       │   ├── types.ts         # InvariantConfig, ThemeJson, Level types
│   │       │   ├── schema.ts        # Zod schemas for invariants + theme.json
│   │       │   └── parser.ts        # YAML invariant config parser
│   │       ├── context/
│   │       │   ├── provider.tsx     # InvarianceProvider (React context)
│   │       │   ├── theme-store.ts   # In-memory theme.json state + subscriptions
│   │       │   └── registry.ts      # Slot registry (tracks mounted slots)
│   │       ├── storage/
│   │       │   ├── types.ts         # StorageBackend interface
│   │       │   ├── memory.ts        # In-memory (dev/testing)
│   │       │   ├── local-storage.ts # localStorage backend
│   │       │   └── api.ts           # REST API backend (production)
│   │       ├── agent/
│   │       │   ├── gatekeeper.ts    # Gatekeeper (classifies intent, validates level)
│   │       │   ├── builder.ts       # Builder (produces theme.json mutations)
│   │       │   └── pipeline.ts      # Orchestrates: Gatekeeper -> Builder -> Verify -> Store
│   │       ├── verify/
│   │       │   ├── engine.ts        # verify() orchestrator
│   │       │   ├── types.ts         # TestResult, VerificationResult
│   │       │   ├── theme-tests.ts   # F1: palette, contrast, fonts, spacing, slot styles
│   │       │   ├── content-tests.ts # F2: non-empty, XSS, alt text
│   │       │   ├── layout-tests.ts  # F3: required elements, order, locked sections
│   │       │   ├── component-tests.ts # F4: library check, props compat
│   │       │   └── utils.ts         # Contrast ratio calc, hex parsing
│   │       ├── runtime/
│   │       │   ├── apply-theme.ts   # Global CSS variable injection from theme.globals
│   │       │   ├── apply-content.ts # DOM text/image replacement
│   │       │   ├── apply-layout.ts  # Section reordering, visibility
│   │       │   └── apply.ts         # Combines all appliers
│   │       ├── panel/
│   │       │   ├── trigger-button.tsx
│   │       │   ├── customization-overlay.tsx
│   │       │   └── customization-panel.tsx
│   │       ├── levels/
│   │       │   └── index.ts         # Level definitions
│   │       └── utils/
│   │           └── errors.ts        # Custom error types
│   │
│   └── verify/                      # invariance-verify (Playwright, CI only, F5+ future)
│       └── ...
│
├── apps/
│   └── demo/                        # Next.js reference app
│       ├── invariance.config.yaml
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx
│       │   │   ├── page.tsx
│       │   │   └── api/invariance/
│       │   │       └── route.ts     # theme.json storage API
│       │   ├── components/
│       │   │   ├── Sidebar.tsx
│       │   │   ├── Header.tsx
│       │   │   ├── Dashboard.tsx
│       │   │   ├── Footer.tsx
│       │   │   └── charts/
│       │   │       ├── BarChart.tsx
│       │   │       ├── LineChart.tsx
│       │   │       └── AreaChart.tsx
│       │   └── lib/
│       │       └── mock-data.ts
│       └── tests/
│           ├── verify.test.ts
│           └── pipeline.test.ts
│
└── examples/
    └── configs/
        ├── minimal.yaml
        └── full.yaml
```

---

## Coding Conventions

### General

- All code is TypeScript with `strict: true`
- Named exports only (except Next.js page/layout components)
- `interface` for extendable shapes, `type` for unions and computed types
- Error classes extend `InvarianceError`
- No classes unless clearly needed (prefer functions and plain objects)
- `async/await` only, never `.then()` chains
- No `any`. Use `unknown` and narrow with type guards.
- Explicit return types on exported functions
- `const` by default, `let` only when reassignment is needed
- No semicolons (Prettier)
- Single quotes
- No console.log in library code
- Comments explain *why*, not *what*

### File naming

- `kebab-case.ts` / `kebab-case.tsx`
- Test files colocated: `thing.ts` and `thing.test.ts`
- No barrel `index.ts` except at package roots

### Import ordering

1. Node builtins
2. External packages
3. Internal packages (`invariance`, `invariance-verify`)
4. Relative imports

Blank line between groups.

---

## The Customization Levels

Everything starts locked. Levels are cumulative.

```
Level 0: Locked (no customization)
Level F1: Style (colors, fonts, spacing, borders, radii) -- theme.json globals + slots
Level F2: Content (text, labels, images) -- theme.json content key
Level F3: Layout (reorder, show/hide, resize) -- theme.json layout key
Level F4: Components (swap from approved library) -- theme.json components key
Level F5+: Pages, behavior, data (future, requires source code modification)
```

F1-F4 are config-only. No code rewriting. No transpilation.

---

## theme.json

Single file per user. Two-part theme section: `globals` (CSS variables on `:root`) and `slots` (arbitrary CSS properties per slot as inline styles).

```json
{
  "version": 1,
  "base_app_version": "v1",
  "theme": {
    "globals": {
      "colors": { "accent": "#e94560", "background-primary": "#1a1a2e" },
      "fonts": { "body": "Inter" },
      "spacing": { "unit": 4, "scale": [0, 4, 8, 12, 16, 24, 32, 48, 64] },
      "radii": { "sm": 4, "md": 8, "lg": 16 }
    },
    "slots": {
      "sidebar": { "backgroundColor": "#1b2a4a", "borderRight": "2px solid #e94560" },
      "footer": { "borderTopColor": "#2a2a4a" }
    }
  },
  "content": {
    "pages": {
      "/dashboard": {
        "el_003": { "text": "My Pipeline" }
      }
    }
  },
  "layout": {
    "pages": {
      "/dashboard": {
        "sections": ["hero", "deals-grid", "footer"],
        "hidden": ["announcements-banner"]
      }
    }
  },
  "components": {
    "pages": {
      "/dashboard": {
        "chart-area": { "component": "LineChart", "props": { "showGrid": true } }
      }
    }
  }
}
```

**Per-slot overrides:** `theme.slots` maps slot names to arbitrary CSS properties (camelCase). `m.slot` applies these as inline styles. This means any CSS property on any wrapped slot is customizable without the developer needing to predict it. The only boundary: if it's not in an `m.slot`, it can't be customized.

---

## The Wrapper Primitives

### m.page

Registers a page with Invariance. Transparent wrapper.

```tsx
<m.page name="dashboard">
  {/* slots go here */}
</m.page>
```

Renders: `<div data-inv-page={name}>{children}</div>`

### m.slot

The primary primitive. Applies per-slot style overrides from `theme.slots` as inline styles. Handles F4 component swaps.

```tsx
<m.slot name="sidebar" level={3} props={{ navigationItems, user }} preserve={true}>
  <Sidebar navigationItems={navigationItems} user={user} />
</m.slot>
```

Props:
- `name` (string): Unique slot identifier
- `level` (Level): Max unlock level (1-7)
- `children` (ReactNode): Default content
- `props` (Record<string, any>, optional): Props for custom/swapped component
- `preserve` (boolean, optional): Cannot be hidden/removed

Behavior:
- Reads `theme.slots[name]` and applies as inline styles on wrapper div
- If F4 component swap exists, renders swapped component from library
- Wraps custom components in ErrorBoundary

### m.text

Shorthand for text-customizable content.

```tsx
<m.text name="page-title">Dashboard</m.text>
```

Renders: `<span data-inv-text={name} data-inv-id={name}>{text}</span>`

---

## The Agent Pipeline

### Gatekeeper (`packages/core/src/agent/gatekeeper.ts`)

**Purpose:** Classify user intent, validate against slot levels. Never produces mutations or code.

**Input:** User message, conversation history, slot registry, invariant config, component library
**Output:** Intent (for Builder) | Clarification (back to user) | Error

```typescript
type GatekeeperResult =
  | { type: 'intent'; slotName: string; level: number; description: string; requirements: string[] }
  | { type: 'clarification'; message: string }
  | { type: 'error'; message: string }
```

**API call:** Claude Sonnet, temp 0.2, max_tokens 1024. JSON-only response.

### Builder (`packages/core/src/agent/builder.ts`)

**Purpose:** Produce the actual change. For F1-F4: a theme.json mutation. For F5+: modified source files.

**Input:** Current theme.json, Gatekeeper intent, slot registry, invariant config, optional retry feedback
**Output:** Partial theme.json mutation + explanation

```typescript
interface BuilderConfigResult {
  mutation: Partial<ThemeJson>
  explanation: string
}
```

**API call:** Claude Sonnet, temp 0.2, max_tokens 4096. JSON-only response.

The Builder receives the invariant config so it can try to produce valid output on the first attempt (e.g., pick palette colors). But correctness is enforced by verification tests, not the Builder's judgment.

### Pipeline (`packages/core/src/agent/pipeline.ts`)

Orchestrates: Gatekeeper -> Builder -> Verify -> Store -> Apply.

Flow:
1. Call Gatekeeper (1 LLM call)
2. If clarification/error: return
3. Call Builder with intent (1 LLM call)
4. Merge mutation into current theme.json
5. Run verification tests (deterministic, no LLM)
6. If fail and retries left: call Builder with test failures (1 more LLM call)
7. If pass: store + apply + return success

LLM calls per request: 2 minimum, 4 worst case. Retries go to Builder only (intent doesn't change).

---

## Verification Engine

Every invariant maps to deterministic test functions. No LLM in the verification loop.

```typescript
interface TestResult {
  name: string
  passed: boolean
  message: string
  severity: 'error' | 'warning'
  autoFixable: boolean
  suggestedFix?: string
}

interface VerificationResult {
  passed: boolean
  results: TestResult[]
}
```

### Built-in Tests

**F1 (theme):** `colorInPalette`, `contrastRatio`, `fontInAllowlist`, `spacingInScale`, `validHexColors`, `radiiBounded`, `slotStylesSafe`, `slotExists`
**F2 (content):** `textNonEmpty`, `noXssVectors`, `imagesHaveAlt`, `textLengthBounded`
**F3 (layout):** `requiredElementsPresent`, `orderConstraints`, `lockedSectionsUntouched`, `noOrphanReferences`
**F4 (components):** `componentInLibrary`, `propsCompatible`, `preservedSlotsNotSwapped`

Both `theme.globals` and `theme.slots` are checked for palette/color compliance.

### Developer Custom Tests (future)

```typescript
invariance.registerTest('exactly-3-tabs', (themeJson) => ({
  name: 'exactly-3-tabs',
  passed: /* check logic */,
  message: '...',
  severity: 'error',
  autoFixable: false,
}))
```

---

## Runtime Application

### Globals: CSS Variables

`theme.globals.colors`, `fonts`, `radii` set as `--inv-*` custom properties on `document.documentElement`.

### Per-Slot: Inline Styles

`m.slot` reads `theme.slots[name]` from context and applies as `style` prop on the wrapper div. Any CSS property, any slot, no pre-mapping needed.

### Content: DOM Mutation

Elements with `data-inv-id` attributes get text/image replaced from `theme.content`.

### Layout: DOM Reordering

Sections with `data-inv-section` attributes get reordered/hidden from `theme.layout`.

### Component Swap: React-Level

`m.slot` resolves `theme.components` against the registered component library and renders the swapped component.

---

## Storage

### StorageBackend Interface

```typescript
interface StorageBackend {
  loadTheme(userId: string, appId: string): Promise<ThemeJson | null>
  saveTheme(userId: string, appId: string, theme: ThemeJson): Promise<void>
  getVersion(userId: string, appId: string): Promise<number>
}
```

**memory:** In-memory Map. Dev/testing.
**localStorage:** `invariance:${appId}:${userId}`. Persists per-browser.
**api:** REST calls to developer endpoint: `GET/PUT/DELETE {url}/theme?userId=&appId=`

---

## Multi-User Architecture

Each user gets their own theme.json. Keyed by `(userId, appId)`.

```
Developer's App (one codebase)
    |
    ├── User A: dark sidebar, custom title
    ├── User B: swapped chart, hidden banner
    └── User C: all defaults (no theme.json)
```

Invariance does NOT handle authentication. The developer provides a `userId` from their auth system.

---

## Invariant Config

```yaml
app: "acme-crm"

frontend:
  design:
    colors:
      mode: "palette"
      palette: ["#e94560", "#0078d4", "#00b894", "#1a1a2e", "#ffffff"]
    fonts:
      allowed: ["Inter", "Inter Tight", "system-ui"]
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
    "/dashboard": { level: F4, required: ["deals-view", "activity-feed"] }
    "/settings": { level: F1 }
```

Parsed with `js-yaml`, validated with zod. Supports future `backend:` and `cross_stack:` sections.

---

## InvarianceProvider

```tsx
<InvarianceProvider
  config={config}
  apiKey={process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || ''}
  userId={currentUser.id}
  componentLibrary={{ BarChart, LineChart, AreaChart }}
  storage="api"
  storageUrl="/api/invariance"
>
  <App />
  <CustomizationPanel />
</InvarianceProvider>
```

On mount:
1. Creates storage backend
2. Loads user's theme.json from backend
3. Populates in-memory theme store
4. Children render with customizations applied immediately

---

## Dependencies by Package

### packages/core (invariance)
- `react` (peer dep, >=18)
- `react-dom` (peer dep, >=18)
- `zod`
- `js-yaml`
- `@types/js-yaml` (dev)
- `typescript` (dev)
- `vitest` (dev)

### apps/demo
- `next` (14+)
- `react`, `react-dom`
- `tailwindcss`
- `invariance` (workspace dep)

---

## Key Design Decisions

1. **theme.json over code rewriting for F1-F4.** Structured config is smaller, faster to apply, deterministically verifiable, and doesn't need transpilation. Per-slot style overrides make it flexible enough for arbitrary CSS changes.

2. **Both agents on every request.** Gatekeeper classifies intent. Builder produces output. Clean separation even for small changes. Makes each agent's system prompt focused and testable.

3. **No Judge agent.** Verification is deterministic test functions. No LLM in the verification loop. Tests are inspectable, runnable in CI, and produce the same result every time.

4. **Per-slot arbitrary CSS overrides.** `theme.slots` maps slot names to any CSS properties. `m.slot` applies them as inline styles. No pre-mapping needed. If it's wrapped, it's customizable.

5. **Wrapper primitives as the Phase 1 bridge.** `m.slot` reads from theme store and applies overrides. Developers wrap components. The scanner (future) replaces this with zero-annotation mode.

6. **Invariants are executable specs.** Each invariant maps to test functions that anyone can run. The framework ships tests for common constraints (palette, contrast, required elements). Developers register custom tests for domain logic.

7. **Store config, not compiled output.** theme.json is the source of truth. On load, runtime applies it. Simple, serializable, diffable.

8. **No SDK dependency for Anthropic.** Raw `fetch` to `api.anthropic.com`. Keeps bundle small.

9. **Panel uses inline styles only.** Must work in any React app regardless of CSS setup.

---

## Phase 1 Scope (Current)

Build the complete F1-F4 pipeline: primitives, two-agent pipeline, deterministic verification, per-user storage, runtime application, customization panel, demo app.

### What's Deferred

- Scanner (zero-annotation mode)
- Review UI (developer dashboard)
- F5+ code path (Builder writing source, Sucrase)
- Content-addressed blob storage
- Invariant change pipeline (checking users when developer updates invariants)
- Backend levels (B1-B6)
