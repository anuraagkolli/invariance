# `invariance init` — Scanner Onboarding Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the scanner from a source-wrapping migration tool into a complete `invariance init` onboarding flow that leaves a clean Nebula runnable and themeable like the demo, proven by a functional-parity acceptance test.

**Architecture:** Extend the scanner's existing `analyze()`/`writeMigration()` seam. New pure emitters (css), a small SSR-injection extension, a level-selection callback threaded into `analyze()` before wrapper edits, an advisor + confirm pair, and an `invariance init` orchestrator that composes them. A representative clean-Nebula fixture + integration test is the acceptance gate.

**Tech Stack:** TypeScript strict, ts-morph, js-yaml, vitest, culori (transitively via `invariance`), `node:readline/promises`. Package manager: pnpm + turbo. `invariance` (core) is a workspace dep of `invariance-scanner`; scanner tests require core built first.

**Spec:** `docs/superpowers/specs/2026-06-13-scanner-onboarding-init-design.md` (read §4 "Verified codebase facts" before starting).

**Conventions:** strict TS, named exports, no `any`, async/await, single quotes, no semicolons, kebab-case files, colocated `*.test.ts`, comments explain *why*. Do not regress the suite (scanner 84, core 396).

---

## File Structure

**Create:**
- `packages/scanner/src/emit/css-emitter.ts` — render the initial theme's `:root` block + idempotently patch `globals.css`. (Unit A)
- `packages/scanner/src/emit/css-emitter.test.ts`
- `packages/scanner/src/init/advise.ts` — deterministic per-slot level recommendation. (Unit C)
- `packages/scanner/src/init/advise.test.ts`
- `packages/scanner/src/init/confirm.ts` — interactive confirm over an injectable prompt. (Unit C)
- `packages/scanner/src/init/confirm.test.ts`
- `packages/scanner/src/init/derive-config.ts` — chosen slot levels → config (unlockPage + section unlocks). (Unit C)
- `packages/scanner/src/init/derive-config.test.ts`
- `packages/scanner/src/init/run.ts` — the `invariance init` orchestrator. (Unit D)
- `packages/scanner/src/init/run.test.ts`
- `packages/scanner/bin/invariance-init.ts` — CLI entry. (Unit D)
- `packages/scanner/src/__fixtures__/nebula-clean/**` — representative unwrapped app. (Unit E)
- `packages/scanner/src/init/acceptance.test.ts` — functional-parity integration test. (Unit E)

**Modify:**
- `packages/core/src/index.ts` — export `themeToCssEntries`. (Unit A)
- `packages/scanner/src/discover.ts` — add `globalsCssFile` to `DiscoveredApp`. (Unit A)
- `packages/scanner/src/migrate.ts` — `AnalyzeResult.globalsCssFile`; wire css-emitter into `writeMigration`; SSR injection; `chooseLevels` callback + level threading. (Units A, B, C)
- `packages/scanner/src/emit/source-rewriter.ts` — `SlotEdit.level`; emit `level={n}`. (Unit C)
- `packages/scanner/src/index.ts` — export `runInit` + init types. (Unit D)
- `packages/scanner/package.json` — add `invariance-init` bin + `init` script. (Unit D)
- `apps/demo/scripts/gen-default-tokens.mjs` — refactor onto `themeToCssEntries`. (Unit A)

---

## Task 1: Clean-Nebula fixture (Unit E.1 — build first)

A representative unwrapped Next.js app: app-router layout + globals + tailwind config + package.json, a shell (sidebar + header) and a home page (hero + card row + text), authored with **literal colors** and **no `var(--inv-*)`/no token utilities**. The integration test (Task 13) scans a temp copy of this.

**Files:**
- Create: `packages/scanner/src/__fixtures__/nebula-clean/package.json`
- Create: `packages/scanner/src/__fixtures__/nebula-clean/tsconfig.json`
- Create: `packages/scanner/src/__fixtures__/nebula-clean/tailwind.config.ts`
- Create: `packages/scanner/src/__fixtures__/nebula-clean/src/app/layout.tsx`
- Create: `packages/scanner/src/__fixtures__/nebula-clean/src/app/globals.css`
- Create: `packages/scanner/src/__fixtures__/nebula-clean/src/app/page.tsx`
- Create: `packages/scanner/src/__fixtures__/nebula-clean/src/components/shell.tsx`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "nebula-clean",
  "version": "0.0.0",
  "private": true
}
```

- [ ] **Step 2: Create `tsconfig.json`** (mirror the `simple-app` fixture so ts-morph loads it)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `tailwind.config.ts`** (literal palette so `resolveConfig` resolves named classes to hex; no `var(--inv-*)`)

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0a0b0d',
        panel: '#1f2225',
        line: '#707883',
        cloud: '#f4f9ff',
        crimson: '#ee4c6e',
      },
    },
  },
  plugins: [],
}
export default config
```

- [ ] **Step 4: Create `src/app/globals.css`** (has `:root` for the app's OWN vars + a `<head>`-less baseline; the css-emitter appends a separate marked block)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --app-gutter: 24px;
}

body {
  margin: 0;
  background: #0a0b0d;
  color: #f4f9ff;
  font-family: Inter, system-ui, sans-serif;
}
```

- [ ] **Step 5: Create `src/app/layout.tsx`** (a `<head>` present so SSR injection has an anchor; default export is a plain function the SSR pass makes async)

```tsx
import type { ReactNode } from 'react'

import './globals.css'

export const metadata = {
  title: 'Nebula',
  description: 'A clean Nebula for scanner onboarding.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 6: Create `src/components/shell.tsx`** (sidebar + header chrome with literal/named colors)

```tsx
import type { ReactNode } from 'react'

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        className="bg-panel text-cloud border-line"
        style={{ width: '230px', padding: '16px', borderRight: '1px solid #707883' }}
      >
        <span style={{ fontWeight: 700 }}>Nebula</span>
      </aside>
      <div style={{ flex: 1 }}>
        <header className="bg-ink text-cloud" style={{ padding: '12px 24px' }}>
          <span>Browse</span>
        </header>
        <main style={{ padding: '24px' }}>{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Create `src/app/page.tsx`** (hero + a card row with editable text; literal colors)

```tsx
import { Shell } from '../components/shell'

export default function HomePage() {
  return (
    <Shell>
      <section style={{ background: '#1f2225', color: '#f4f9ff', padding: '32px', borderRadius: '8px' }}>
        <h1>Tonight&apos;s picks</h1>
      </section>
      <section style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <article style={{ background: '#1f2225', color: '#f4f9ff', width: '168px', height: '252px' }}>
            <span>Orbit</span>
          </article>
          <article style={{ background: '#1f2225', color: '#f4f9ff', width: '168px', height: '252px' }}>
            <span>Drift</span>
          </article>
        </div>
      </section>
    </Shell>
  )
}
```

- [ ] **Step 8: Verify the fixture parses with ts-morph + extracts colors** (sanity, no assertion on scan yet)

Run: `cd packages/scanner && pnpm vitest run src/migrate.test.ts`
Expected: PASS (existing tests still green; the new fixture is inert until Task 13).

- [ ] **Step 9: Commit**

```bash
git add packages/scanner/src/__fixtures__/nebula-clean
git commit -m "test(scanner): add representative clean-Nebula fixture for onboarding acceptance"
```

---

## Task 2: Export `themeToCssEntries` from the main `invariance` entry (Unit A.1)

`themeToCssEntries` lives in `core/src/runtime/apply.ts` and is exported only from `invariance/headless`. The scanner imports from the main `invariance` entry. Add the export.

**Files:**
- Modify: `packages/core/src/index.ts`
- Test: `packages/scanner/src/emit/css-emitter.test.ts` (created in Task 3 consumes it; this task is verified by core build + a one-line import test)

- [ ] **Step 1: Write the failing test** — `packages/core/src/runtime/apply.test.ts` (append, or create if absent)

```ts
import { describe, it, expect } from 'vitest'
import * as invariance from '../index'

describe('main entry exports', () => {
  it('exports themeToCssEntries', () => {
    expect(typeof invariance.themeToCssEntries).toBe('function')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/core && pnpm vitest run src/runtime/apply.test.ts`
Expected: FAIL — `themeToCssEntries` is undefined on the main entry.

- [ ] **Step 3: Add the export** — in `packages/core/src/index.ts`, beside the existing `renderThemeCss` re-export (line ~57)

```ts
export { themeToCssEntries } from './runtime/apply'
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/core && pnpm vitest run src/runtime/apply.test.ts`
Expected: PASS

- [ ] **Step 5: Build core (scanner depends on it)**

Run: `pnpm --filter invariance build`
Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.ts packages/core/src/runtime/apply.test.ts
git commit -m "feat(core): export themeToCssEntries from the main entry"
```

---

## Task 3: `discoverApp` locates `globals.css` (Unit A.2)

**Files:**
- Modify: `packages/scanner/src/discover.ts`
- Test: `packages/scanner/src/discover.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import path from 'path'
import { discoverApp } from './discover'

const NEBULA = path.resolve(__dirname, '__fixtures__/nebula-clean')

describe('discoverApp — globals.css', () => {
  it('locates globals.css next to the layout', async () => {
    const d = await discoverApp(NEBULA)
    expect(d.globalsCssFile).not.toBeNull()
    expect(d.globalsCssFile?.endsWith(path.join('src', 'app', 'globals.css'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/scanner && pnpm vitest run src/discover.test.ts`
Expected: FAIL — `globalsCssFile` is not a property of `DiscoveredApp`.

- [ ] **Step 3: Implement** — add the field to the interface and detection in `discoverApp`

In the `DiscoveredApp` interface, add:

```ts
  globalsCssFile: string | null
```

Add a helper near `findTailwindConfig`:

```ts
async function findGlobalsCss(layoutFile: string | null): Promise<string | null> {
  if (!layoutFile) return null
  // Convention: the root layout imports './globals.css' from its own directory.
  const candidate = path.join(path.dirname(layoutFile), 'globals.css')
  if (await fileExists(candidate)) return candidate
  return null
}
```

In `discoverApp`, after `layoutFile` is resolved and before the `return`, compute it and include in the returned object:

```ts
  const globalsCssFile = await findGlobalsCss(layoutFile)
```

```ts
  return {
    appRoot: absRoot,
    packageJsonName,
    pages,
    tailwindConfigPath,
    layoutFile,
    globalsCssFile,
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/scanner && pnpm vitest run src/discover.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/scanner/src/discover.ts packages/scanner/src/discover.test.ts
git commit -m "feat(scanner): discoverApp locates globals.css beside the layout"
```

---

## Task 4: `css-emitter` — render `:root` + idempotent patch (Unit A.3)

**Files:**
- Create: `packages/scanner/src/emit/css-emitter.ts`
- Test: `packages/scanner/src/emit/css-emitter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import type { ThemeJsonV2 } from 'invariance'
import { renderRootBlock, patchGlobalsCss, GEN_START, GEN_END } from './css-emitter'

const theme: ThemeJsonV2 = {
  version: 2,
  base_app_version: 'v1',
  theme: {
    roles: { '--inv-surface-0': '#0a0b0d', '--inv-text-primary': '#f4f9ff' },
    slots: { '--inv-sidebar-bg': 'var(--inv-surface-0)' },
  },
}

describe('renderRootBlock', () => {
  it('emits roles then slots inside a marked :root block', () => {
    const block = renderRootBlock(theme)
    expect(block).toContain(GEN_START)
    expect(block).toContain(GEN_END)
    expect(block).toMatch(/:root\s*\{/)
    expect(block).toContain('--inv-surface-0: #0a0b0d;')
    expect(block).toContain('--inv-sidebar-bg: var(--inv-surface-0);')
    // roles precede slots
    expect(block.indexOf('--inv-surface-0')).toBeLessThan(block.indexOf('--inv-sidebar-bg'))
  })
})

describe('patchGlobalsCss', () => {
  it('appends the block once and replaces it on re-run (idempotent)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'css-emit-'))
    const file = path.join(dir, 'globals.css')
    await fs.writeFile(file, ':root { --app-gutter: 24px; }\n', 'utf-8')

    await patchGlobalsCss(file, theme)
    const once = await fs.readFile(file, 'utf-8')
    expect(once).toContain('--app-gutter: 24px') // app's own :root preserved
    expect((once.match(new RegExp(GEN_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length).toBe(1)

    await patchGlobalsCss(file, theme)
    const twice = await fs.readFile(file, 'utf-8')
    expect((twice.match(new RegExp(GEN_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length).toBe(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/scanner && pnpm vitest run src/emit/css-emitter.test.ts`
Expected: FAIL — module `./css-emitter` not found.

- [ ] **Step 3: Implement `css-emitter.ts`**

```ts
import { promises as fs } from 'fs'

import { themeToCssEntries } from 'invariance'
import type { ThemeJsonV2 } from 'invariance'

// Marker pair delimiting the scanner-owned :root block inside the app's
// globals.css. Re-runs replace ONLY between these markers, so the developer's
// own CSS (including their own :root) is never touched.
export const GEN_START = '/* INVARIANCE-GENERATED:start — regenerated by invariance-scan, do not hand-edit */'
export const GEN_END = '/* INVARIANCE-GENERATED:end */'

/**
 * Render the initial theme's roles+slots as a marked :root block. Uses the
 * SAME ordered entry list (themeToCssEntries) the client apply + SSR paths
 * consume, so the static baseline can never disagree with runtime tokens.
 */
export function renderRootBlock(theme: ThemeJsonV2): string {
  const decls = themeToCssEntries(theme)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n')
  return `${GEN_START}\n:root {\n${decls}\n}\n${GEN_END}\n`
}

/**
 * Idempotently write the generated :root block into globals.css. If a prior
 * block exists (between the markers) it is replaced in place; otherwise the
 * block is appended. The app's own CSS is preserved verbatim.
 */
export async function patchGlobalsCss(globalsCssFile: string, theme: ThemeJsonV2): Promise<void> {
  const block = renderRootBlock(theme)
  const existing = await fs.readFile(globalsCssFile, 'utf-8')

  const startIdx = existing.indexOf(GEN_START)
  if (startIdx !== -1) {
    const endIdx = existing.indexOf(GEN_END, startIdx)
    const tail = endIdx !== -1 ? existing.slice(endIdx + GEN_END.length) : ''
    const next = existing.slice(0, startIdx) + block.replace(/\n$/, '') + tail
    await fs.writeFile(globalsCssFile, next, 'utf-8')
    return
  }

  const sep = existing.endsWith('\n') ? '\n' : '\n\n'
  await fs.writeFile(globalsCssFile, existing + sep + block, 'utf-8')
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/scanner && pnpm vitest run src/emit/css-emitter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/scanner/src/emit/css-emitter.ts packages/scanner/src/emit/css-emitter.test.ts
git commit -m "feat(scanner): css-emitter renders the :root baseline + idempotent globals.css patch"
```

---

## Task 5: Wire css-emitter into `writeMigration` (Unit A.4)

`AnalyzeResult` gains `globalsCssFile`; `writeMigration` writes the `:root` block.

**Files:**
- Modify: `packages/scanner/src/migrate.ts`
- Test: `packages/scanner/src/migrate.test.ts` (append a case that writes to a temp copy)

- [ ] **Step 1: Write the failing test** — append to `migrate.test.ts`

```ts
import { promises as fsp } from 'fs'
import os from 'os'

async function copyDir(src: string, dest: string): Promise<void> {
  await fsp.mkdir(dest, { recursive: true })
  for (const entry of await fsp.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) await copyDir(s, d)
    else await fsp.copyFile(s, d)
  }
}

describe('writeMigration — globals.css baseline', () => {
  it('writes the generated :root block into globals.css', async () => {
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'nebula-'))
    const root = path.join(tmp, 'nebula-clean')
    await copyDir(path.resolve(__dirname, '__fixtures__/nebula-clean'), root)

    const { analyze, writeMigration } = await import('./migrate')
    const result = await analyze({ appRoot: root, apiKey: '', dryRun: false })
    await writeMigration(result)

    const css = await fsp.readFile(path.join(root, 'src/app/globals.css'), 'utf-8')
    expect(css).toContain('INVARIANCE-GENERATED:start')
    expect(css).toMatch(/--inv-[a-z0-9-]+:/)
    expect(css).toContain('--app-gutter: 24px') // app's own :root preserved
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/scanner && pnpm vitest run src/migrate.test.ts -t "globals.css baseline"`
Expected: FAIL — no generated block (css-emitter not wired).

- [ ] **Step 3: Implement** — in `migrate.ts`:

Add the import at the top:

```ts
import { patchGlobalsCss } from './emit/css-emitter'
```

Add `globalsCssFile` to `AnalyzeResult`:

```ts
  /** globals.css discovered for the :root baseline, if any. */
  globalsCssFile: string | null
```

In `analyze()`, include it in the returned object (it's already on `discovered`):

```ts
  return { plan, diff, report, project, appRoot, layoutFile: discovered.layoutFile, globalsCssFile: discovered.globalsCssFile }
```

In `writeMigration()`, after the config/theme writes and before/after provider injection, add:

```ts
  if (result.globalsCssFile) {
    await patchGlobalsCss(result.globalsCssFile, result.plan.initialTheme)
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/scanner && pnpm vitest run src/migrate.test.ts -t "globals.css baseline"`
Expected: PASS

- [ ] **Step 5: Run the full scanner suite (no regression)**

Run: `pnpm --filter invariance build && cd packages/scanner && pnpm vitest run`
Expected: PASS (all prior tests green; `analyze`'s new field is additive).

- [ ] **Step 6: Commit**

```bash
git add packages/scanner/src/migrate.ts packages/scanner/src/migrate.test.ts
git commit -m "feat(scanner): writeMigration emits the :root token baseline into globals.css"
```

---

## Task 6: Refactor `gen-default-tokens.mjs` onto the shared formatter (Unit A.5)

The demo script reimplements CSS formatting. Route it through `themeToCssEntries` so demo and scanner can't diverge.

**Files:**
- Modify: `apps/demo/scripts/gen-default-tokens.mjs`

- [ ] **Step 1: Capture current output (golden baseline)**

Run: `cd /Users/anuraag/invariance && pnpm --filter invariance build && node apps/demo/scripts/gen-default-tokens.mjs > /tmp/tokens-before.txt 2>/dev/null`
Expected: a block of `--inv-*: value;` lines.

- [ ] **Step 2: Refactor the script** — replace the print loop so it builds a synthetic v2 theme and formats via the shared entries function

```js
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { compileTheme, themeToCssEntries } = require('invariance')

const spec = {
  mode: 'dark',
  accentHue: 12,
  accentChroma: 'vivid',
  neutralTint: 255,
  neutralTintStrength: 'subtle',
  contrast: 'standard',
  fontPairing: 'geo-grotesk',
  radius: 'subtle',
  shadow: 'subtle',
  density: 'standard',
  borderWeight: 'hairline',
  rationale: 'Nebula default: deep cool dark with one crimson accent.',
}

const { roles, warnings } = compileTheme(spec, {
  contrast: 4.5,
  accent_chroma_max: 0.25,
})

// Format through the same entries function the scanner + runtime use, so the
// demo baseline and scanner output share one CSS formatter.
const theme = { version: 2, base_app_version: 'v1', theme: { roles } }
console.log(
  themeToCssEntries(theme)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n'),
)

if (warnings.length) console.error('warnings:', warnings)
```

- [ ] **Step 3: Verify output is byte-identical to the baseline**

Run: `node apps/demo/scripts/gen-default-tokens.mjs > /tmp/tokens-after.txt 2>/dev/null && diff /tmp/tokens-before.txt /tmp/tokens-after.txt && echo IDENTICAL`
Expected: `IDENTICAL` (no diff — roles-only theme yields the same lines).

- [ ] **Step 4: Commit**

```bash
git add apps/demo/scripts/gen-default-tokens.mjs
git commit -m "refactor(demo): generate default tokens via shared themeToCssEntries formatter"
```

---

## Task 7: SSR `<style>` inlining in `injectProvider` (Unit B)

Extend provider injection to make first paint themed: export the config from `providers.tsx`, and patch `layout.tsx` with the cookie read + `renderThemeCss` + inline `<style>`.

**Files:**
- Modify: `packages/scanner/src/migrate.ts`
- Test: `packages/scanner/src/migrate.test.ts` (append)

- [ ] **Step 1: Write the failing test** — append to `migrate.test.ts`

```ts
describe('writeMigration — SSR inlining', () => {
  it('patches layout.tsx with cookie-driven renderThemeCss + inline style', async () => {
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'nebula-ssr-'))
    const root = path.join(tmp, 'nebula-clean')
    await copyDir(path.resolve(__dirname, '__fixtures__/nebula-clean'), root)

    const { analyze, writeMigration } = await import('./migrate')
    const result = await analyze({ appRoot: root, apiKey: '', dryRun: false })
    await writeMigration(result)

    const layout = await fsp.readFile(path.join(root, 'src/app/layout.tsx'), 'utf-8')
    expect(layout).toContain("from 'next/headers'")
    expect(layout).toMatch(/renderThemeCss|themeFromCookieHeader/)
    expect(layout).toContain('inv-ssr-theme')
    expect(layout).toMatch(/export default async function/)
    // providers.tsx exports config for the layout to consume
    const providers = await fsp.readFile(path.join(root, 'src/app/providers.tsx'), 'utf-8')
    expect(providers).toContain('export const config')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/scanner && pnpm vitest run src/migrate.test.ts -t "SSR inlining"`
Expected: FAIL — no SSR markers in layout.

- [ ] **Step 3: Implement** — in `migrate.ts`:

(a) In `buildProvidersSource`, change `const config` to `export const config` so the layout can import it:

```ts
export const config: InvarianceConfig = ${configJson}
```

(b) Add an `injectSsrInlining` helper (string-based, mirrors the existing `injectProvider` style; preconditions: a `</head>` and a `return (` exist — true for the fixture, warned otherwise):

```ts
// Adds cookie-driven SSR theme inlining to a root layout so first paint is
// themed. Idempotent (keys off the inv-ssr-theme marker). Requires a <head>
// anchor and a `return (` in the default export; a layout without these is
// left untouched (the client still themes post-hydration, just with a flash).
async function injectSsrInlining(layoutFile: string): Promise<void> {
  let src = await fs.readFile(layoutFile, 'utf-8')
  if (src.includes('inv-ssr-theme')) return
  if (!src.includes('</head>') || !/return\s*\(/.test(src)) return

  function addImport(source: string, line: string): string {
    if (source.includes(line)) return source
    const lastImportIdx = source.lastIndexOf('\nimport ')
    if (lastImportIdx === -1) return line + '\n' + source
    const eol = source.indexOf('\n', lastImportIdx + 1)
    return source.slice(0, eol + 1) + line + '\n' + source.slice(eol + 1)
  }

  src = addImport(src, "import { headers } from 'next/headers'")
  src = addImport(src, "import { renderThemeCss, themeFromCookieHeader } from 'invariance'")
  src = addImport(src, "import { config } from './providers'")

  // Make the default export async (function form; covers the fixture + common case).
  src = src.replace(/export default function /, 'export default async function ')

  // Insert the SSR computation just before the first `return (`.
  src = src.replace(
    /(\n[ \t]*)return\s*\(/,
    `$1const cookieHeader = headers().get('cookie')` +
      `$1const ssrTheme = themeFromCookieHeader(cookieHeader, config)` +
      `$1const ssrCss = renderThemeCss(ssrTheme, config)$1return (`,
  )

  // Inject the <style> just before </head>.
  src = src.replace(
    /<\/head>/,
    `  {ssrCss ? <style id="inv-ssr-theme" dangerouslySetInnerHTML={{ __html: ssrCss }} /> : null}\n      </head>`,
  )

  await fs.writeFile(layoutFile, src, 'utf-8')
}
```

(c) Call it from `writeMigration` (not inside `injectProvider`, which has an early `return` at `migrate.ts:105` when the layout already mentions `Providers` — calling from `writeMigration` keeps SSR injection independent of that path). In `writeMigration`, change the provider-injection block to:

```ts
  if (result.layoutFile) {
    await injectProvider(result.layoutFile, result.appRoot, result.plan.config)
    await injectSsrInlining(result.layoutFile)
  }
```

`injectSsrInlining` is its own module-scope `async function` in `migrate.ts` (defined as in step (b)).

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/scanner && pnpm vitest run src/migrate.test.ts -t "SSR inlining"`
Expected: PASS

- [ ] **Step 5: Run full scanner suite**

Run: `cd packages/scanner && pnpm vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/scanner/src/migrate.ts packages/scanner/src/migrate.test.ts
git commit -m "feat(scanner): inject SSR theme inlining into the root layout for no-flash first paint"
```

---

## Task 8: Thread `level` through the slot wrapper (Unit C — plumbing)

Default behavior unchanged (level 0 everywhere); this only makes the wrapper level *settable*.

**Files:**
- Modify: `packages/scanner/src/emit/source-rewriter.ts`
- Test: `packages/scanner/src/emit/source-rewriter.test.ts` (append)

- [ ] **Step 1: Write the failing test** — append to `source-rewriter.test.ts` (use the file's existing harness for building a Project; if it builds a project from a string, mirror that. Otherwise add a minimal one as below.)

```ts
import { Project } from 'ts-morph'
import { describe, it, expect } from 'vitest'
import { applyWrapperEdits } from './source-rewriter'

describe('wrapSlotNode — level', () => {
  it('emits the slot location level instead of hardcoded 0', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const sf = project.createSourceFile(
      'page.tsx',
      'export default function P(){return (<div><aside>x</aside></div>)}',
    )
    const plan = {
      slotCssVariables: { sidebar: [] },
      __slotLocations: [
        { name: 'sidebar', file: 'page.tsx', jsxPath: 'aside', preserve: true, level: 2 },
      ],
      __textLocations: [],
      __pageLocations: [],
    } as unknown as Parameters<typeof applyWrapperEdits>[1]
    applyWrapperEdits(project, plan)
    expect(sf.getFullText()).toContain('<m.slot name="sidebar" level={2}')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/scanner && pnpm vitest run src/emit/source-rewriter.test.ts -t "level"`
Expected: FAIL — output contains `level={0}`.

- [ ] **Step 3: Implement** — in `source-rewriter.ts`:

Add `level` to the `SlotEdit` interface:

```ts
interface SlotEdit {
  slotName: string
  file: string
  jsxPath: string
  preserve: boolean
  level: number
  cssVariables: string[]
  description?: string
  aliases?: string[]
}
```

Add `level` to the local `SlotLocation` interface inside `applyWrapperEdits`:

```ts
  interface SlotLocation {
    name: string
    file: string
    jsxPath: string
    preserve: boolean
    level?: number
    description?: string
    aliases?: string[]
  }
```

In `wrapSlotNode`, use the edit's level:

```ts
  const wrapped = `<m.slot name="${edit.slotName}" level={${edit.level}}${preserve}${description}${aliases}${vars}>${original}</m.slot>`
```

In the `wrapSlotNode` call inside `applyWrapperEdits`, pass the level (default 0):

```ts
      wrapSlotNode(node, {
        slotName: slot.name,
        file: slot.file,
        jsxPath: slot.jsxPath,
        preserve: slot.preserve,
        level: slot.level ?? 0,
        cssVariables: vars,
        ...(slot.description ? { description: slot.description } : {}),
        ...(slot.aliases && slot.aliases.length > 0 ? { aliases: slot.aliases } : {}),
      })
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/scanner && pnpm vitest run src/emit/source-rewriter.test.ts`
Expected: PASS (new test passes; existing tests still pass because absent `level` defaults to 0).

- [ ] **Step 5: Commit**

```bash
git add packages/scanner/src/emit/source-rewriter.ts packages/scanner/src/emit/source-rewriter.test.ts
git commit -m "feat(scanner): make m.slot wrapper level settable (defaults to 0)"
```

---

## Task 9: `derive-config` — chosen levels → config (Unit C)

Pure function: given per-page slot levels, raise page levels (`unlockPage`) and unlock app-wide design sections per the `SECTION_MIN_LEVEL` ladder.

**Files:**
- Create: `packages/scanner/src/init/derive-config.ts`
- Test: `packages/scanner/src/init/derive-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import type { InvarianceConfig } from 'invariance'
import { deriveConfigFromLevels } from './derive-config'

const base: InvarianceConfig = {
  app: 'x',
  frontend: {
    design: { colors: { mode: 'palette', palette: ['#000000'] }, constraints: { contrast: '>= 4.5' } },
    pages: { '/': { level: 0, required: ['sidebar', 'hero'] } },
  },
}

describe('deriveConfigFromLevels', () => {
  it('F1 on a page raises its level and unlocks colors to any', () => {
    const next = deriveConfigFromLevels(base, { '/': { sidebar: 0, hero: 1 } })
    expect(next.frontend?.pages?.['/']?.level).toBeGreaterThanOrEqual(1)
    expect(next.frontend?.design?.colors?.mode).toBe('any')
  })

  it('all-locked leaves the config at level 0 and palette mode', () => {
    const next = deriveConfigFromLevels(base, { '/': { sidebar: 0, hero: 0 } })
    expect(next.frontend?.pages?.['/']?.level).toBe(0)
    expect(next.frontend?.design?.colors?.mode).toBe('palette')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/scanner && pnpm vitest run src/init/derive-config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `derive-config.ts`**

```ts
import type { InvarianceConfig } from 'invariance'

import { applyUnlock, unlockPage } from '../unlock/presets'
import type { UnlockSection } from '../unlock/presets'

// The level at which each app-wide design section becomes available — mirrors
// SECTION_MIN_LEVEL in unlock/presets.ts (kept local to avoid exporting it).
const SECTION_MIN: Array<[Exclude<UnlockSection, 'all'>, number]> = [
  ['colors', 1],
  ['fonts', 1],
  ['spacing', 1],
  ['content', 2],
  ['layout', 3],
  ['components', 4],
]

/** route -> (slotName -> chosen level) */
export type ChosenLevels = Record<string, Record<string, number>>

/**
 * Translate the developer's per-slot level choices into config edits using the
 * existing deterministic unlock presets. Each page rises to the max level
 * chosen among its slots; each app-wide design section is unlocked once any
 * slot reaches its required level. Purely additive — never lowers a level.
 */
export function deriveConfigFromLevels(config: InvarianceConfig, chosen: ChosenLevels): InvarianceConfig {
  let next = config

  let maxAll = 0
  for (const slots of Object.values(chosen)) {
    for (const lvl of Object.values(slots)) maxAll = Math.max(maxAll, lvl)
  }

  // App-wide section unlocks (these also floor every page to the section min).
  for (const [section, min] of SECTION_MIN) {
    if (maxAll >= min) next = applyUnlock(next, section)
  }

  // Per-page level = max(current after flooring, chosen max on the page).
  for (const [route, slots] of Object.entries(chosen)) {
    const pageMax = Math.max(0, ...Object.values(slots))
    const current = next.frontend?.pages?.[route]?.level ?? 0
    const target = Math.max(current, pageMax)
    if (next.frontend?.pages?.[route] && target > current) {
      next = unlockPage(next, route, target)
    }
  }

  return next
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/scanner && pnpm vitest run src/init/derive-config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/scanner/src/init/derive-config.ts packages/scanner/src/init/derive-config.test.ts
git commit -m "feat(scanner): derive config (page levels + section unlocks) from chosen slot levels"
```

---

## Task 10: `chooseLevels` callback in `analyze()` (Unit C — seam)

Thread an optional callback into `analyze()`, invoked after the plan is built but before `applyWrapperEdits`, that sets per-slot wrapper levels and derives config.

**Files:**
- Modify: `packages/scanner/src/migrate.ts`
- Test: `packages/scanner/src/migrate.test.ts` (append)

- [ ] **Step 1: Write the failing test** — append to `migrate.test.ts`

```ts
describe('analyze — chooseLevels callback', () => {
  it('sets wrapper levels and derives config from chosen levels', async () => {
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'nebula-lvl-'))
    const root = path.join(tmp, 'nebula-clean')
    await copyDir(path.resolve(__dirname, '__fixtures__/nebula-clean'), root)

    const { analyze } = await import('./migrate')
    const seen: string[] = []
    const result = await analyze({
      appRoot: root,
      apiKey: '',
      dryRun: true,
      chooseLevels: async (slots) => {
        for (const s of slots) seen.push(s.name)
        // Unlock the first non-preserved slot to F1.
        const target = slots.find((s) => !s.preserve)
        const map = new Map<string, number>()
        if (target) map.set(target.name, 1)
        return map
      },
    })

    expect(seen.length).toBeGreaterThan(0)
    // A slot wrapper got level={1} in the diff.
    expect(result.diff).toMatch(/<m\.slot name="[^"]+" level=\{1\}/)
    // Colors unlocked to any.
    expect(result.plan.config.frontend?.design?.colors?.mode).toBe('any')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/scanner && pnpm vitest run src/migrate.test.ts -t "chooseLevels"`
Expected: FAIL — `chooseLevels` not a known option; no `level={1}`.

- [ ] **Step 3: Implement** — in `migrate.ts`:

Add to `MigrateOptions`:

```ts
  /** Optional interactive level selection. Invoked after naming/plan-build,
   *  before wrapper edits, with one entry per discovered slot. Returns a map of
   *  slotName -> chosen level. Absent → every slot stays level 0 (scan default). */
  chooseLevels?: (slots: SlotChoiceInput[]) => Promise<Map<string, number>>
```

Add the exported input type near the top (after imports):

```ts
export interface SlotChoiceInput {
  name: string
  page: string
  preserve: boolean
  description?: string
}
```

Import the deriver at the top:

```ts
import { deriveConfigFromLevels } from './init/derive-config'
import type { ChosenLevels } from './init/derive-config'
```

In `analyze()`, the `SlotLocation` interface gains `level` and a `page`:

```ts
  interface SlotLocation {
    name: string
    file: string
    jsxPath: string
    preserve: boolean
    level: number
    page: string
    description?: string
    aliases?: string[]
  }
```

Where slots are accumulated into `slotLocations` (the `for (const slot of semantic.slots)` loop), add `level` and `page`:

```ts
      slotLocations.push({
        name: slot.name,
        file: slot.file,
        jsxPath: slot.jsxPath,
        preserve: slot.preserve,
        level: slot.level, // 0 from the scanner-agent; raised by chooseLevels below
        page: page.route,
        ...(slot.description ? { description: slot.description } : {}),
        ...(slot.aliases && slot.aliases.length > 0 ? { aliases: slot.aliases } : {}),
      })
```

After `buildMigrationPlan(...)` produces `plan` and the `__slotLocations` are attached, and **before** `applyVariableRewrites`/`applyWrapperEdits`, insert the selection step:

```ts
  // Interactive level selection (optional). Runs before wrapper edits so chosen
  // levels are baked into the m.slot wrappers, and derives the config (page
  // levels + section unlocks) deterministically. The model never picks levels.
  if (opts.chooseLevels) {
    const inputs: SlotChoiceInput[] = slotLocations.map((s) => ({
      name: s.name,
      page: s.page,
      preserve: s.preserve,
      ...(s.description ? { description: s.description } : {}),
    }))
    const chosen = await opts.chooseLevels(inputs)

    const byPage: ChosenLevels = {}
    for (const loc of slotLocations) {
      const level = chosen.get(loc.name) ?? 0
      loc.level = level
      ;(byPage[loc.page] ??= {})[loc.name] = level
    }
    plan.config = deriveConfigFromLevels(plan.config, byPage)
  }
```

(`applyWrapperEdits` already reads `level` off `__slotLocations` after Task 8.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/scanner && pnpm vitest run src/migrate.test.ts -t "chooseLevels"`
Expected: PASS

- [ ] **Step 5: Run full scanner suite (no-callback path unchanged)**

Run: `cd packages/scanner && pnpm vitest run`
Expected: PASS (existing end-to-end test has no `chooseLevels`, so all slots stay `level={0}` — diff assertions unchanged).

- [ ] **Step 6: Commit**

```bash
git add packages/scanner/src/migrate.ts packages/scanner/src/migrate.test.ts
git commit -m "feat(scanner): chooseLevels callback bakes per-slot levels + derives config before wrapper edits"
```

---

## Task 11: `advise` — deterministic level recommendations (Unit C)

**Files:**
- Create: `packages/scanner/src/init/advise.ts`
- Test: `packages/scanner/src/init/advise.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { adviseLevels } from './advise'

describe('adviseLevels', () => {
  it('recommends 0 for chrome (preserve) and 1 for content', () => {
    const advice = adviseLevels([
      { name: 'sidebar', page: '/', preserve: true },
      { name: 'hero', page: '/', preserve: false },
    ])
    const sidebar = advice.find((a) => a.slot === 'sidebar')
    const hero = advice.find((a) => a.slot === 'hero')
    expect(sidebar?.level).toBe(0)
    expect(hero?.level).toBe(1)
    expect(typeof sidebar?.rationale).toBe('string')
    expect(sidebar?.rationale.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/scanner && pnpm vitest run src/init/advise.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `advise.ts`**

```ts
import type { SlotChoiceInput } from '../migrate'

export interface SlotAdvice {
  slot: string
  page: string
  level: number
  rationale: string
}

// Deterministic recommendation. Structural chrome (preserve) stays locked so
// identity/navigation can't drift; content regions are recommended F1 (recolor)
// — the safest customization. The number is a SUGGESTION; the developer's
// confirmed choice is what's applied (the model never picks levels).
export function adviseLevels(slots: SlotChoiceInput[]): SlotAdvice[] {
  return slots.map((s) => {
    if (s.preserve) {
      return {
        slot: s.name,
        page: s.page,
        level: 0,
        rationale: 'Structural chrome — kept locked so navigation and identity stay stable.',
      }
    }
    return {
      slot: s.name,
      page: s.page,
      level: 1,
      rationale: 'Content region — safe to recolor (F1) without restructuring the page.',
    }
  })
}
```

(Optional LLM rationale refinement is a documented follow-on — it would replace `rationale` text only, never `level`. Not required for functional parity; out of scope for this plan.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/scanner && pnpm vitest run src/init/advise.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/scanner/src/init/advise.ts packages/scanner/src/init/advise.test.ts
git commit -m "feat(scanner): deterministic per-slot level advisor (chrome locked, content F1)"
```

---

## Task 12: `confirm` — interactive selection over an injectable prompt (Unit C)

**Files:**
- Create: `packages/scanner/src/init/confirm.ts`
- Test: `packages/scanner/src/init/confirm.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { confirmLevels } from './confirm'
import type { SlotAdvice } from './advise'

const advice: SlotAdvice[] = [
  { slot: 'sidebar', page: '/', level: 0, rationale: 'chrome' },
  { slot: 'hero', page: '/', level: 1, rationale: 'content' },
]

describe('confirmLevels', () => {
  it('accept-all returns the advised levels', async () => {
    const prompt = async () => 'y'
    const result = await confirmLevels(advice, prompt)
    expect(result.get('sidebar')).toBe(0)
    expect(result.get('hero')).toBe(1)
  })

  it('per-slot override is honored', async () => {
    // First answer 'n' to accept-all, then per-slot levels: sidebar 2, hero <enter>=keep
    const answers = ['n', '2', '']
    let i = 0
    const prompt = async () => answers[i++] ?? ''
    const result = await confirmLevels(advice, prompt)
    expect(result.get('sidebar')).toBe(2)
    expect(result.get('hero')).toBe(1) // empty = keep advised
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/scanner && pnpm vitest run src/init/confirm.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `confirm.ts`**

```ts
import { createInterface } from 'node:readline/promises'

import type { SlotAdvice } from './advise'

export type PromptFn = (question: string) => Promise<string>

/** A readline-backed prompt for real CLI use. */
export function makeReadlinePrompt(): { prompt: PromptFn; close: () => void } {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return {
    prompt: async (q: string) => (await rl.question(q)).trim(),
    close: () => rl.close(),
  }
}

const LEVEL_LABELS = ['0 locked', '1 recolor (F1)', '2 content (F2)', '3 layout (F3)', '4 components (F4)']

/**
 * Walk the advised levels with the developer. "Accept all" applies the
 * recommendations; otherwise each slot is prompted (empty input keeps the
 * advised level). Returns slotName -> chosen level.
 */
export async function confirmLevels(advice: SlotAdvice[], prompt: PromptFn): Promise<Map<string, number>> {
  const chosen = new Map<string, number>()

  process.stdout.write('\nRecommended customization levels:\n')
  for (const a of advice) {
    process.stdout.write(`  ${a.slot} → ${LEVEL_LABELS[a.level] ?? a.level}  (${a.rationale})\n`)
  }

  const acceptAll = (await prompt('\nAccept all recommendations? [Y/n] ')).toLowerCase()
  if (acceptAll === '' || acceptAll === 'y' || acceptAll === 'yes') {
    for (const a of advice) chosen.set(a.slot, a.level)
    return chosen
  }

  for (const a of advice) {
    const raw = await prompt(`  ${a.slot} level [0-4] (enter=${a.level}): `)
    if (raw === '') {
      chosen.set(a.slot, a.level)
      continue
    }
    const n = Number.parseInt(raw, 10)
    chosen.set(a.slot, Number.isInteger(n) && n >= 0 && n <= 4 ? n : a.level)
  }
  return chosen
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/scanner && pnpm vitest run src/init/confirm.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/scanner/src/init/confirm.ts packages/scanner/src/init/confirm.test.ts
git commit -m "feat(scanner): interactive level confirm over an injectable prompt"
```

---

## Task 13: `runInit` orchestrator (Unit D)

Compose: analyze (with advise+confirm as `chooseLevels`) → writeMigration → check → next-steps.

**Files:**
- Create: `packages/scanner/src/init/run.ts`
- Test: `packages/scanner/src/init/run.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { promises as fsp } from 'fs'
import os from 'os'
import path from 'path'
import { runInit } from './run'

async function copyDir(src: string, dest: string): Promise<void> {
  await fsp.mkdir(dest, { recursive: true })
  for (const entry of await fsp.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) await copyDir(s, d)
    else await fsp.copyFile(s, d)
  }
}

describe('runInit', () => {
  it('applies, unlocks the chosen slot, and reports a clean check', async () => {
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'init-run-'))
    const root = path.join(tmp, 'nebula-clean')
    await copyDir(path.resolve(__dirname, '../__fixtures__/nebula-clean'), root)

    // Non-interactive: accept all recommendations (prompt always returns 'y').
    const result = await runInit({
      appRoot: root,
      apiKey: '',
      apply: true,
      prompt: async () => 'y',
    })

    expect(result.checkPassed).toBe(true)
    // hero (content) advised F1 → its page is unlocked.
    expect(result.config.frontend?.pages?.['/']?.level).toBeGreaterThanOrEqual(1)
    const layout = await fsp.readFile(path.join(root, 'src/app/layout.tsx'), 'utf-8')
    expect(layout).toContain('inv-ssr-theme')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/scanner && pnpm vitest run src/init/run.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `run.ts`**

```ts
import type { InvarianceConfig } from 'invariance'

import { analyze, writeMigration } from '../migrate'
import type { SlotChoiceInput } from '../migrate'
import { runCheck } from '../check'
import { adviseLevels } from './advise'
import { confirmLevels } from './confirm'
import type { PromptFn } from './confirm'

export interface RunInitOptions {
  appRoot: string
  apiKey: string
  apply: boolean
  /** Injectable prompt; the CLI passes a readline-backed one, tests a stub. */
  prompt: PromptFn
}

export interface RunInitResult {
  config: InvarianceConfig
  checkPassed: boolean
  report: string
  diff: string
}

/**
 * The guided onboarding flow: discover → analyze → advise + confirm levels →
 * write (source + globals.css + SSR + config) → check → report. Selection is
 * advisory (deterministic recommendation) but human-confirmed; deterministic
 * code performs every mutation.
 */
export async function runInit(opts: RunInitOptions): Promise<RunInitResult> {
  const chooseLevels = async (slots: SlotChoiceInput[]): Promise<Map<string, number>> => {
    const advice = adviseLevels(slots)
    return confirmLevels(advice, opts.prompt)
  }

  const result = await analyze({
    appRoot: opts.appRoot,
    apiKey: opts.apiKey,
    dryRun: !opts.apply,
    chooseLevels,
  })

  if (opts.apply) {
    await writeMigration(result)
  }

  let checkPassed = false
  if (opts.apply) {
    const check = await runCheck(opts.appRoot)
    checkPassed = check.ok
  }

  return { config: result.plan.config, checkPassed, report: result.report, diff: result.diff }
}
```

(Verified: `runCheck(appPath: string): Promise<CheckResult>`, `CheckResult.ok: boolean` — `check/index.ts:157,164`.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/scanner && pnpm vitest run src/init/run.test.ts`
Expected: PASS

- [ ] **Step 5: Export from the package index** — `packages/scanner/src/index.ts`

```ts
export { runInit } from './init/run'
export type { RunInitOptions, RunInitResult } from './init/run'
```

- [ ] **Step 6: Commit**

```bash
git add packages/scanner/src/init/run.ts packages/scanner/src/init/run.test.ts packages/scanner/src/index.ts
git commit -m "feat(scanner): runInit orchestrator composes analyze + advise/confirm + write + check"
```

---

## Task 14: `invariance-init` CLI (Unit D)

**Files:**
- Create: `packages/scanner/bin/invariance-init.ts`
- Modify: `packages/scanner/package.json`

- [ ] **Step 1: Implement `bin/invariance-init.ts`** (mirror `invariance-scan` arg/env handling; add `--yes` for non-interactive accept-all)

```ts
#!/usr/bin/env node
import path from 'path'

import { runInit } from '../src/init/run'
import { makeReadlinePrompt } from '../src/init/confirm'

interface ParsedArgs {
  appPath: string
  apply: boolean
  yes: boolean
  apiKey: string | null
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2)
  let appPath: string | null = null
  let apply = false
  let yes = false
  let apiKey: string | null = null
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--apply') { apply = true; continue }
    if (a === '--yes' || a === '-y') { yes = true; continue }
    if (a === '--api-key') { apiKey = args[i + 1] ?? null; i++; continue }
    if (a === '--help' || a === '-h') { printUsage(); process.exit(0) }
    if (a && !a.startsWith('--')) { appPath = a; continue }
  }
  if (!appPath) { printUsage(); process.exit(1) }
  return { appPath, apply, yes, apiKey }
}

function printUsage(): void {
  process.stderr.write(
    'Usage: invariance-init <app-path> [--apply] [--yes] [--api-key <key>]\n' +
      '\n' +
      '  Guided onboarding: discover -> analyze -> choose invariants -> wrap -> verify.\n' +
      '  Default is dry-run (prints the diff). --apply writes files.\n' +
      '  --yes accepts all recommended levels non-interactively.\n',
  )
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv)
  const appRoot = path.resolve(parsed.appPath)
  const apiKey = parsed.apiKey ?? process.env.ANTHROPIC_API_KEY ?? process.env.NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY ?? ''

  const rl = parsed.yes ? null : makeReadlinePrompt()
  const prompt = parsed.yes ? async () => 'y' : rl!.prompt

  try {
    const result = await runInit({ appRoot, apiKey, apply: parsed.apply, prompt })
    if (!parsed.apply) {
      process.stdout.write(result.diff)
      process.stdout.write('\n\nDry run. Re-run with --apply to write files.\n')
    } else {
      process.stdout.write(`\n✓ Onboarding applied. invariance check: ${result.checkPassed ? 'passed' : 'FAILED'}\n`)
      process.stdout.write('Next: set an LLM key (NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY) for natural-language prompts; theme packs work without one.\n')
      process.stdout.write('Run `pnpm dev` and open the customization panel.\n')
    }
  } catch (err) {
    process.stderr.write(`invariance-init: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exitCode = 1
  } finally {
    rl?.close()
  }
}

void main()
```

- [ ] **Step 2: Add the bin + script to `package.json`**

In `"bin"`:

```json
    "invariance-init": "./dist/bin/invariance-init.js",
```

In `"scripts"`:

```json
    "init": "tsx bin/invariance-init.ts",
```

- [ ] **Step 3: Smoke-test the CLI (dry-run) against a temp copy**

```bash
cd /Users/anuraag/invariance
TMP=$(mktemp -d) && cp -r packages/scanner/src/__fixtures__/nebula-clean "$TMP/app"
cd packages/scanner && pnpm tsx bin/invariance-init.ts "$TMP/app" --yes 2>&1 | head -40
```

Expected: prints a diff containing `<m.slot` and `level={1}` for a content slot; no crash; ends with "Dry run."

- [ ] **Step 4: Build the package (ensure bin compiles)**

Run: `pnpm --filter invariance-scanner build`
Expected: exit 0; `dist/bin/invariance-init.js` exists.

- [ ] **Step 5: Commit**

```bash
git add packages/scanner/bin/invariance-init.ts packages/scanner/package.json
git commit -m "feat(scanner): invariance-init CLI for guided onboarding"
```

---

## Task 15: Acceptance test — functional parity (Unit E.2)

The integration gate: scan the clean Nebula and assert it's wrapped, themed, and verified.

**Files:**
- Create: `packages/scanner/src/init/acceptance.test.ts`

- [ ] **Step 1: Write the acceptance test**

```ts
import { describe, it, expect } from 'vitest'
import { promises as fsp } from 'fs'
import os from 'os'
import path from 'path'
import { ThemeJsonV2Schema, verifyV2, deriveConstraints } from 'invariance'
import { runInit } from './run'
import { analyze } from '../migrate'
import type { SlotChoiceInput } from '../migrate'

async function copyDir(src: string, dest: string): Promise<void> {
  await fsp.mkdir(dest, { recursive: true })
  for (const entry of await fsp.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) await copyDir(s, d)
    else await fsp.copyFile(s, d)
  }
}

const FIXTURE = path.resolve(__dirname, '../__fixtures__/nebula-clean')

describe('acceptance: scan clean Nebula → demo-equivalent', () => {
  it('wraps source, themes globals + SSR, unlocks the chosen slot, passes check + verify', async () => {
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'accept-'))
    const root = path.join(tmp, 'nebula-clean')
    await copyDir(FIXTURE, root)

    const result = await runInit({ appRoot: root, apiKey: '', apply: true, prompt: async () => 'y' })

    // 1. Wrapped source with a non-zero slot level.
    const page = await fsp.readFile(path.join(root, 'src/app/page.tsx'), 'utf-8')
    expect(page).toMatch(/<m\.page name="home">/)
    expect(page).toMatch(/<m\.slot name="[^"]+" level=\{[1-4]\}/)
    expect(page).toMatch(/var\(--inv-/)

    // 2. globals.css carries the generated :root baseline.
    const css = await fsp.readFile(path.join(root, 'src/app/globals.css'), 'utf-8')
    expect(css).toContain('INVARIANCE-GENERATED:start')
    expect(css).toMatch(/:root\s*\{[\s\S]*--inv-/)

    // 3. SSR inlining present in the layout.
    const layout = await fsp.readFile(path.join(root, 'src/app/layout.tsx'), 'utf-8')
    expect(layout).toContain('inv-ssr-theme')
    expect(layout).toMatch(/export default async function/)

    // 4. Config: page unlocked, colors open.
    expect(result.config.frontend?.pages?.['/']?.level).toBeGreaterThanOrEqual(1)
    expect(result.config.frontend?.design?.colors?.mode).toBe('any')

    // 5. invariance check passes on the emitted artifacts.
    expect(result.checkPassed).toBe(true)

    // 6. Emitted theme verifies (AA contrast etc.) — re-analyze for the object.
    const fresh = await fsp.mkdtemp(path.join(os.tmpdir(), 'accept2-'))
    const root2 = path.join(fresh, 'nebula-clean')
    await copyDir(FIXTURE, root2)
    const a = await analyze({
      appRoot: root2,
      apiKey: '',
      dryRun: true,
      chooseLevels: async (slots: SlotChoiceInput[]) => {
        const m = new Map<string, number>()
        const t = slots.find((s) => !s.preserve)
        if (t) m.set(t.name, 1)
        return m
      },
    })
    const theme = a.plan.initialTheme
    expect(ThemeJsonV2Schema.safeParse(theme).success).toBe(true)
    const v = verifyV2(theme, a.plan.config, deriveConstraints(a.plan.config))
    expect(v.passed, JSON.stringify(v.results.filter((r) => !r.passed))).toBe(true)
  })
})
```

- [ ] **Step 2: Run the acceptance test**

Run: `pnpm --filter invariance build && cd packages/scanner && pnpm vitest run src/init/acceptance.test.ts`
Expected: PASS. If `verifyV2`/`deriveConstraints` signatures differ, align with `migrate.test.ts:127` (the working reference).

- [ ] **Step 3: Run the full scanner + core suites**

Run: `cd /Users/anuraag/invariance && pnpm build && pnpm test`
Expected: PASS — no regression (scanner 84 + new tests; core 396).

- [ ] **Step 4: Commit**

```bash
git add packages/scanner/src/init/acceptance.test.ts
git commit -m "test(scanner): functional-parity acceptance — scan clean Nebula to demo-equivalent"
```

---

## Task 16 (CI-only follow-on): live browser parity

> Per CLAUDE.md, Playwright runs in CI only. This task is optional for the core deliverable and may be deferred — `log()` it if skipped so coverage isn't overstated.

Scope: a CI script that `next build && next start`s a scanned temp copy of the fixture (as a throwaway workspace with deps), then drives Playwright to assert: (a) no-flash themed first paint (SSR `<style>` present in initial HTML via `curl`), (b) all 10 packs apply AA-passing (reuse `apps/demo/scripts/visual-qa.mjs` patterns), (c) "make the sidebar blue" contrast-solves through the live panel. Build it against the existing `apps/demo` visual-QA harness as the reference. Not required to land Units A–E.

---

## Self-Review Notes (author checklist — already applied)

- **Spec coverage:** Unit A → Tasks 2–6; Unit B → Task 7; Unit C → Tasks 8–12 (+ seam in 10); Unit D → Tasks 13–14; Unit E → Tasks 1, 15, (16 CI). The three §4 corrections (wrapper level, page level, colors unlock) are all exercised by Task 15.
- **Type consistency:** `SlotChoiceInput` defined in `migrate.ts` (Task 10), consumed by `advise.ts` (11) and `run.ts` (13). `PromptFn` defined in `confirm.ts` (12), consumed by `run.ts` (13) and the CLI (14). `ChosenLevels` defined in `derive-config.ts` (9), used in `migrate.ts` (10). `themeToCssEntries` exported in Task 2, consumed in Task 4.
- **Verify-before-claim:** Task 13 flags the one unverified shape (`runCheck`'s result field) with the fallback reference; Task 15 flags `verifyV2` signature alignment against the known-good `migrate.test.ts:127`.
- **No-regression gates:** Tasks 5, 7, 10, 15 each re-run the full scanner suite; the no-callback path is asserted byte-unchanged.
