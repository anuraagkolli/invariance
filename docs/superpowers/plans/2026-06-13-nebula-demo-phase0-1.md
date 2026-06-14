# Nebula Demo — Phase 0 + Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a new `apps/nebula` (Next 14 + Tailwind) in the `combined` monorepo and restore the full Nebula streaming UI + rich `CustomizationPanel` + `/dev` dev menu, running on the **design plane** (`@invariance/design`). (Phase 2 — re-attaching the business-logic/invariants plane — is a separate plan.)

**Architecture:** Nebula's customization is 100% design-plane and `@invariance/design` already exports every symbol it needs (verified full parity, 21/21). So this phase is a near-verbatim port: scaffold Next/Tailwind, copy Nebula's files from the `main` worktree, and rename one import specifier `'invariance' → '@invariance/design'`. No changes to any combined package. Streamline stays untouched.

**Tech Stack:** Next.js 14 (App Router), Tailwind 3.4, TypeScript (strict, ESM), `@invariance/design` (built dist, peer React 18), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-13-nebula-on-combined-design.md`
**Source of truth for ported files:** the `main` worktree at `/Users/anuraag/invariance-main/apps/demo` (already created via `git worktree`).

---

## Conventions used by every port task

- **Port = copy the exact file from the worktree, then rename the import.** The rename command (run from the new app dir after copying) is:
  ```bash
  # macOS sed; rewrites the bare specifier only
  grep -rlZ "from 'invariance'" src | xargs -0 sed -i '' "s#from 'invariance'#from '@invariance/design'#g"
  ```
- After each task: `pnpm -F @invariance/nebula typecheck` must pass before commit.
- Build the design dist once before running Next: `pnpm -F @invariance/design build` (Next consumes `@invariance/design`'s `dist/`).
- App package name: `@invariance/nebula`; dir `apps/nebula`; dev port **4321** (free; matches main's README).

---

## File structure (created in this phase)

```
apps/nebula/
  package.json            # next/react/@invariance/design deps; scripts (dev -p 4321, build, test, typecheck)
  next.config.js          # transpilePackages:['@invariance/design']; serverComponentsExternalPackages:['js-yaml']; output standalone; outputFileTracingRoot=monorepo root
  tsconfig.json           # Next tsconfig (paths @/*); postcss.config.js; tailwind.config.ts; next-env.d.ts
  .gitignore              # .next, .data (file-store output)
  public/og.png  src/app/icon.svg
  src/app/                # layout, page, providers, globals.css, {series,showcase,gauntlet,dev}/page.tsx, api/{themes,themes/history,dev-config,llm/*}/route.ts
  src/components/         # shell,sidebar,header,hero,home-screen,title-card,title-row,title-detail-modal,title-modal-context,search-overlay,search-context,mini-nebula,demo-tour,footer,progress-bar,series-screen, dev/{lock-controls,token-diff,version-card,version-timeline}
  src/lib/                # dev-config(.test), theme-diff(.test), invariance-config, titles, server/{dev-config-store(.test),theme-history-store(.test),json-file-store,llm-proxy(.test)}
```

---

## Task 0.1: Scaffold a blank Next 14 + Tailwind app in the monorepo

**Files:**
- Create: `apps/nebula/package.json`, `apps/nebula/next.config.js`, `apps/nebula/tsconfig.json`, `apps/nebula/postcss.config.js`, `apps/nebula/tailwind.config.ts`, `apps/nebula/next-env.d.ts`, `apps/nebula/.gitignore`, `apps/nebula/src/app/layout.tsx`, `apps/nebula/src/app/page.tsx`, `apps/nebula/src/app/globals.css`

- [ ] **Step 1: Create `apps/nebula/package.json`**

```json
{
  "name": "@invariance/nebula",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev -p 4321",
    "build": "next build",
    "start": "next start -p 4321",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@invariance/design": "workspace:*",
    "next": "^14.2.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.0",
    "culori": "^4",
    "playwright": "^1.60.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `apps/nebula/next.config.js`**

```js
const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@invariance/design'],
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['js-yaml'],
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
}

module.exports = nextConfig
```

- [ ] **Step 3: Create `apps/nebula/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `apps/nebula/postcss.config.js`**

```js
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } }
```

- [ ] **Step 5: Create `apps/nebula/tailwind.config.ts`** — copy verbatim from the worktree:

```bash
cp /Users/anuraag/invariance-main/apps/demo/tailwind.config.ts apps/nebula/tailwind.config.ts
```

- [ ] **Step 6: Create `apps/nebula/next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 7: Create `apps/nebula/.gitignore`**

```
.next
.data
*.tsbuildinfo
```

- [ ] **Step 8: Create a minimal `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`** (placeholder, replaced in Phase 1):

`src/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```
`src/app/layout.tsx`:
```tsx
import './globals.css'
export const metadata = { title: 'Nebula' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>)
}
```
`src/app/page.tsx`:
```tsx
export default function Page() {
  return <main style={{ padding: 24 }}>Nebula scaffold OK</main>
}
```

- [ ] **Step 9: Install + build the design dep**

Run: `pnpm install && pnpm -F @invariance/design build`
Expected: install succeeds; design `dist/` built.

- [ ] **Step 10: Verify the blank app builds**

Run: `pnpm -F @invariance/nebula build`
Expected: `next build` completes with no errors (a single static route `/`).

- [ ] **Step 11: Commit**

```bash
git add apps/nebula
git commit -m "Nebula: scaffold Next 14 + Tailwind app in the monorepo"
```

---

## Task 0.2: Smoke-test the dev server

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server in the background**

Run: `pnpm -F @invariance/nebula dev > /tmp/nebula-dev.log 2>&1 &` then poll: `for i in $(seq 1 30); do curl -s -o /dev/null -w '%{http_code}' http://localhost:4321/ && break; sleep 1; done`
Expected: `200`.

- [ ] **Step 2: Confirm the placeholder renders, then stop the server**

Run: `curl -s http://localhost:4321/ | grep -c "Nebula scaffold OK"` (expect `1`); then `kill %1`.

(No commit — verification only.)

---

## Task 1.1: Port static + pure-presentational layer (zero `invariance` imports)

These files have **no** `'invariance'` import, so they copy verbatim.

**Files:**
- Replace: `apps/nebula/src/app/globals.css`, `apps/nebula/tailwind.config.ts` (already copied)
- Create: `apps/nebula/src/lib/titles.ts`, `apps/nebula/public/og.png`, `apps/nebula/src/app/icon.svg`, and components `title-card.tsx`, `title-row.tsx`, `mini-nebula.tsx`, `footer.tsx`, `progress-bar.tsx`, `title-modal-context.tsx`, `search-context.tsx`

- [ ] **Step 1: Copy the files**

```bash
SRC=/Users/anuraag/invariance-main/apps/demo
cp $SRC/src/app/globals.css apps/nebula/src/app/globals.css
mkdir -p apps/nebula/src/lib apps/nebula/src/components apps/nebula/public
cp $SRC/src/lib/titles.ts apps/nebula/src/lib/titles.ts
cp $SRC/public/og.png apps/nebula/public/og.png
cp $SRC/src/app/icon.svg apps/nebula/src/app/icon.svg
for f in title-card title-row mini-nebula footer progress-bar title-modal-context search-context; do
  cp $SRC/src/components/$f.tsx apps/nebula/src/components/$f.tsx
done
```

- [ ] **Step 2: Verify no `invariance` imports leaked in this set**

Run: `grep -rl "from 'invariance'" apps/nebula/src/components apps/nebula/src/lib/titles.ts || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Typecheck**

Run: `pnpm -F @invariance/nebula typecheck`
Expected: PASS (these files only depend on React/next-link/local imports already present).

- [ ] **Step 4: Commit**

```bash
git add apps/nebula
git commit -m "Nebula: port static data + pure presentational components"
```

---

## Task 1.2: Port lib + server stores + API route handlers (rename imports)

**Files:**
- Create: `apps/nebula/src/lib/{dev-config.ts,dev-config.test.ts,theme-diff.ts,theme-diff.test.ts,invariance-config.ts}`, `apps/nebula/src/lib/server/{dev-config-store.ts,dev-config-store.test.ts,theme-history-store.ts,theme-history-store.test.ts,json-file-store.ts,llm-proxy.ts,llm-proxy.test.ts}`, `apps/nebula/src/app/api/{themes/route.ts,themes/history/route.ts,dev-config/route.ts,llm/chat/completions/route.ts,llm/v1/messages/route.ts}`

- [ ] **Step 1: Copy lib + server + api trees**

```bash
SRC=/Users/anuraag/invariance-main/apps/demo
mkdir -p apps/nebula/src/lib/server apps/nebula/src/app/api/themes/history apps/nebula/src/app/api/dev-config apps/nebula/src/app/api/llm/chat/completions apps/nebula/src/app/api/llm/v1/messages
cp $SRC/src/lib/{dev-config.ts,dev-config.test.ts,theme-diff.ts,theme-diff.test.ts,invariance-config.ts} apps/nebula/src/lib/
cp $SRC/src/lib/server/*.ts apps/nebula/src/lib/server/
cp $SRC/src/app/api/themes/route.ts apps/nebula/src/app/api/themes/route.ts
cp $SRC/src/app/api/themes/history/route.ts apps/nebula/src/app/api/themes/history/route.ts
cp $SRC/src/app/api/dev-config/route.ts apps/nebula/src/app/api/dev-config/route.ts
cp $SRC/src/app/api/llm/chat/completions/route.ts apps/nebula/src/app/api/llm/chat/completions/route.ts
cp $SRC/src/app/api/llm/v1/messages/route.ts apps/nebula/src/app/api/llm/v1/messages/route.ts
```

- [ ] **Step 2: Rename the import specifier across the app**

```bash
cd apps/nebula && grep -rlZ "from 'invariance'" src | xargs -0 sed -i '' "s#from 'invariance'#from '@invariance/design'#g"; cd ../..
```

- [ ] **Step 3: Confirm no bare `'invariance'` specifiers remain**

Run: `grep -rn "from 'invariance'" apps/nebula/src || echo "all renamed"`
Expected: `all renamed`.

- [ ] **Step 4: Force Node runtime on the LLM proxy + theme/dev-config routes**

Each `route.ts` under `apps/nebula/src/app/api/` must run on Node (file-store + fetch proxy), not Edge. Add this line at the top of each of the 5 route files (below the imports):

```ts
export const runtime = 'nodejs'
```

- [ ] **Step 5: Typecheck**

Run: `pnpm -F @invariance/nebula typecheck`
Expected: PASS.

- [ ] **Step 6: Run the ported unit tests**

Run: `pnpm -F @invariance/nebula test`
Expected: PASS — `dev-config.test`, `theme-diff.test`, `server/dev-config-store.test`, `server/theme-history-store.test`, `server/llm-proxy.test` all green (they ported verbatim).

- [ ] **Step 7: Commit**

```bash
git add apps/nebula
git commit -m "Nebula: port lib + server stores + API routes (rename to @invariance/design)"
```

---

## Task 1.3: Port the app shell + screens + provider/layout (the live UI)

**Files:**
- Replace: `apps/nebula/src/app/{layout.tsx,page.tsx}`
- Create: `apps/nebula/src/app/providers.tsx`, `apps/nebula/src/components/{shell,sidebar,header,hero,home-screen,title-detail-modal,search-overlay,demo-tour,series-screen}.tsx`, `apps/nebula/src/app/series/page.tsx`

- [ ] **Step 1: Copy the shell, screens, provider, layout, home**

```bash
SRC=/Users/anuraag/invariance-main/apps/demo
mkdir -p apps/nebula/src/app/series
cp $SRC/src/app/layout.tsx apps/nebula/src/app/layout.tsx
cp $SRC/src/app/page.tsx apps/nebula/src/app/page.tsx
cp $SRC/src/app/providers.tsx apps/nebula/src/app/providers.tsx
cp $SRC/src/app/series/page.tsx apps/nebula/src/app/series/page.tsx
for f in shell sidebar header hero home-screen title-detail-modal search-overlay demo-tour series-screen; do
  cp $SRC/src/components/$f.tsx apps/nebula/src/components/$f.tsx
done
```

- [ ] **Step 2: Rename imports across the app again (covers the new files)**

```bash
cd apps/nebula && grep -rlZ "from 'invariance'" src | xargs -0 sed -i '' "s#from 'invariance'#from '@invariance/design'#g"; cd ../..
```

- [ ] **Step 3: Fix the Next 14 App-Router inert id in `title-detail-modal.tsx`**

The modal sets background `inert` by querying `#__next` (Pages-router id) with a `#app-root` fallback — neither exists in App Router by default. Add `id="app-root"` to the `<body>`'s child wrapper. In `apps/nebula/src/app/layout.tsx`, wrap `{children}` in a div with that id:

```tsx
// inside <body> in layout.tsx
<div id="app-root">{children}</div>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm -F @invariance/nebula typecheck`
Expected: PASS.

- [ ] **Step 5: Build**

Run: `pnpm -F @invariance/nebula build`
Expected: `next build` completes (routes `/`, `/series`).

- [ ] **Step 6: Verify the home page renders (screenshot)**

Start dev (`pnpm -F @invariance/nebula dev > /tmp/nebula-dev.log 2>&1 &`, poll :4321 for 200), then screenshot with Playwright:

```bash
cat > /tmp/neb-shot.mjs <<'EOF'
import { createRequire } from 'module'
const require = createRequire('/Users/anuraag/invariance/apps/nebula/')
const { chromium } = require('playwright')
const b = await chromium.launch(); const p = await (await b.newContext({ viewport:{width:1440,height:1000} })).newPage()
await p.goto('http://localhost:4321/', { waitUntil:'networkidle' }); await p.waitForTimeout(1500)
await p.screenshot({ path:'/tmp/nebula-home.png' }); await b.close(); console.log('ok')
EOF
node /tmp/neb-shot.mjs
```
Expected: `/tmp/nebula-home.png` shows the Nebula shell (sidebar + hero + title rows) + the floating Customize trigger. Read the screenshot to confirm. Stop the server (`kill %1`).

- [ ] **Step 7: Commit**

```bash
git add apps/nebula
git commit -m "Nebula: port app shell, screens, provider + layout (live UI renders)"
```

---

## Task 1.4: Port the dev menu + showcase + gauntlet

**Files:**
- Create: `apps/nebula/src/app/dev/page.tsx`, `apps/nebula/src/app/showcase/page.tsx`, `apps/nebula/src/app/gauntlet/page.tsx`, `apps/nebula/src/components/dev/{lock-controls,token-diff,version-card,version-timeline}.tsx`

- [ ] **Step 1: Copy the dev menu + showcase/gauntlet pages**

```bash
SRC=/Users/anuraag/invariance-main/apps/demo
mkdir -p apps/nebula/src/app/dev apps/nebula/src/app/showcase apps/nebula/src/app/gauntlet apps/nebula/src/components/dev
cp $SRC/src/app/dev/page.tsx apps/nebula/src/app/dev/page.tsx
cp $SRC/src/app/showcase/page.tsx apps/nebula/src/app/showcase/page.tsx
cp $SRC/src/app/gauntlet/page.tsx apps/nebula/src/app/gauntlet/page.tsx
cp $SRC/src/components/dev/*.tsx apps/nebula/src/components/dev/
```

- [ ] **Step 2: Rename imports across the app again**

```bash
cd apps/nebula && grep -rlZ "from 'invariance'" src | xargs -0 sed -i '' "s#from 'invariance'#from '@invariance/design'#g"; cd ../..
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm -F @invariance/nebula typecheck && pnpm -F @invariance/nebula build`
Expected: PASS; routes now include `/dev`, `/showcase`, `/gauntlet`.

- [ ] **Step 4: Verify /dev + /showcase render (screenshots)**

Start dev, then screenshot `http://localhost:4321/dev` and `http://localhost:4321/showcase` (adapt `/tmp/neb-shot.mjs` URLs/paths). Read both:
- `/dev`: the developer dashboard — version timeline + lock controls + token diff (fixed-neutral styling).
- `/showcase`: the "ten vibes" wall — 10 independently-themed mini-Nebula cards.
Stop the server.

- [ ] **Step 5: Commit**

```bash
git add apps/nebula
git commit -m "Nebula: port dev menu + showcase + gauntlet"
```

---

## Task 1.5: End-to-end customization (design plane) + turbo wiring

**Files:** none (config + verification); optionally `turbo.json` is already generic (`build`/`test`/`typecheck` tasks apply to the new app automatically).

- [ ] **Step 1: Confirm Ollama is up (qwen) for live prompts**

Run: `curl -s http://localhost:11434/api/tags | grep -c qwen2.5`
Expected: `>=1`. (If 0, the keyless theme **packs** still work; only free-form prompts need the model.)

- [ ] **Step 2: Drive the CustomizationPanel keyless path (theme pack)**

Start dev (:4321). Playwright: open the Customize trigger, click a theme **pack** chip (keyless), wait, and assert `getComputedStyle(document.body).getPropertyValue('--inv-accent')` changed from the baseline. Screenshot before/after.

```bash
cat > /tmp/neb-cust.mjs <<'EOF'
import { createRequire } from 'module'
const require = createRequire('/Users/anuraag/invariance/apps/nebula/')
const { chromium } = require('playwright')
const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:1440,height:1000} }); const p = await ctx.newPage()
await p.goto('http://localhost:4321/', { waitUntil:'networkidle' }); await p.waitForTimeout(1500)
const before = await p.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--inv-accent').trim())
await p.click('[aria-label*="ustomize"], [data-invariance-trigger], button:has-text("Customize")').catch(()=>{})
await p.waitForTimeout(800)
// click the first theme pack chip in the panel (text varies; pick a known pack name from THEME_PACKS, e.g. "Retro Arcade")
await p.click('text=/retro|neobrutalist|ocean|pastel|sunset|mono/i').catch(()=>{})
await p.waitForTimeout(2500)
const after = await p.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--inv-accent').trim())
console.log('accent before/after:', before, after, before!==after ? 'CHANGED ✅' : 'UNCHANGED ❌')
await p.screenshot({ path:'/tmp/nebula-themed.png' }); await b.close()
EOF
node /tmp/neb-cust.mjs
```
Expected: `CHANGED ✅` and `/tmp/nebula-themed.png` shows the re-themed Nebula. Read the screenshot. Stop the server.

- [ ] **Step 3: Full turbo build/test of the workspace (nothing else regressed)**

Run: `pnpm -w build && pnpm -w test`
Expected: all packages + apps green (Streamline, console, control-plane unchanged; nebula builds + its ported unit tests pass).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Nebula: design-plane customization verified end-to-end" || echo "nothing to commit"
```

---

## Phase 1 exit criteria

- `apps/nebula` runs on `:4321` with the full Nebula shell, screens, the rich `CustomizationPanel`, and the `/dev` dev menu.
- Theme packs (keyless) and free-form prompts (qwen) re-theme the live app via the design plane.
- `pnpm -w build` / `pnpm -w test` green; Streamline + console + control-plane untouched.
- **This restores the look + dev menu the user wanted.** Phase 2 (business-logic plane: API routes + manifest + `withInvariance` + Guardrails on appId "nebula") is a separate plan.

## Self-review notes (already applied)

- **Spec coverage:** Phase 0 scaffold (Task 0.1–0.2) + Phase 1 port — static (1.1), lib/api (1.2), shell/screens (1.3), dev menu/showcase (1.4), e2e customization + turbo (1.5). Phase 2/3 explicitly out of this plan per the ratified "Phase 1 first" sequencing.
- **No design-package change needed** (full import parity verified) — so no task touches `@invariance/design` beyond `build`.
- **Placeholder scan:** every step is a concrete copy/rename/verify with exact paths + commands. Verification is build + ported unit tests + Playwright screenshots (a UI port has no new logic to TDD; the 2 existing unit suites port verbatim).
- **Consistency:** package name `@invariance/nebula`, dir `apps/nebula`, port `4321`, import rename `'invariance' → '@invariance/design'` used identically in 1.2/1.3/1.4.
- **Risk handled inline:** Node runtime on API routes (1.2 step 4); App-Router inert id (1.3 step 3); design dist built before Next (0.1 step 9); qwen optional (1.5 step 1).
