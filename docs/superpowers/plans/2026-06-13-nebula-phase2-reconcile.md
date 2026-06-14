# Nebula Phase 2 + Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-attach the business-logic / invariants plane to the Nebula demo (`apps/nebula`) and reconcile the product: Nebula gets a governed content API + an AppManifest of invariants enforced by `@invariance/server`'s `withInvariance`, the console + Guardrails point at Nebula, docs reflect reality, and the parked console-only restyle lands.

**Architecture:** Per the ratified decision, business-logic mods + the invariants crown jewel are surfaced **developer-side via the console/Guardrails** (no in-app logic prompt; Nebula's UI is untouched — themes stay in the design-plane `CustomizationPanel`). Nebula's manifest **mirrors Streamline's** (same endpoint ids/paths/policies, `appId:"nebula"`) and its API returns titles in the same `{shows:[...]}` shape, so the **existing Guardrails catalog works unchanged** against Nebula. Streamline stays as the platform integration test.

**Tech Stack:** Next 14 route handlers, `@invariance/server` (`withInvariance` fetch adapter, `runtime='nodejs'`), the control-plane (Hono, `:4400`), `@invariance/client`-free (mods apply server-side at the seam).

**Spec:** `docs/superpowers/specs/2026-06-13-nebula-on-combined-design.md` (Phase 2 section).
**Reference for handler logic:** `apps/demo/server/app.ts` (Streamline's Express handlers — adapt to Next route handlers).

---

## File structure (this phase)

```
apps/nebula/
  invariance.manifest.json                    # NEW: copy of apps/demo/invariance.manifest.json, appId "nebula"
  scripts/seed.mjs                            # NEW: publish the manifest to the control plane
  package.json                                # MODIFY: add "seed" script
  src/lib/invariance-server.ts                # NEW: shared withInvariance config (appId nebula, getSubject)
  src/lib/catalog.ts                          # NEW: titles.ts -> show/featured/continue shape + watchlist store
  src/app/api/shows/route.ts                  # NEW (GET)        wrapped withInvariance
  src/app/api/featured/route.ts               # NEW (GET)
  src/app/api/continue/route.ts               # NEW (GET)
  src/app/api/watchlist/route.ts              # NEW (GET, POST)
  src/app/api/watchlist/[id]/route.ts         # NEW (DELETE)
apps/console/src/App.tsx                       # MODIFY: DEFAULT_APP "streamline" -> "nebula"
apps/console/vite.config.ts                    # MODIFY: /demo-api proxy target -> :4321
CLAUDE.md, README.md                           # MODIFY: reflect Nebula showcase + two planes
(+ cherry-pick console-only restyle from e6dd188)
```

---

## Task 1: Nebula content catalog + shared server config

**Files:**
- Create: `apps/nebula/src/lib/catalog.ts`, `apps/nebula/src/lib/invariance-server.ts`

- [ ] **Step 1: Create `apps/nebula/src/lib/catalog.ts`** — maps the static `TITLES` into the Streamline-compatible response shapes + a per-subject watchlist store (dev, in-memory). Mirrors `apps/demo/server/app.ts` logic.

```ts
import { randomUUID } from 'node:crypto'
import { TITLES, type Title } from './titles'

// Streamline-compatible "show" projection (title + maturity are the fields the
// manifest's invariants protect; rating is omitted — Nebula titles have none).
export interface Show {
  id: string
  title: string
  year: number
  genre: string
  maturity: Title['maturity']
  durationMin: number
  synopsis: string
  hue: number
}

export const SHOWS: Show[] = TITLES.map((t) => ({
  id: t.id,
  title: t.title,
  year: t.year,
  genre: t.genre,
  maturity: t.maturity,
  durationMin: t.durationMin,
  synopsis: t.synopsis,
  hue: t.hue,
}))

// The billboard/featured title (the manifest locks `show.title`).
export const FEATURED_ID = 'crimson-archive'

export interface ContinueItem {
  showId: string
  progress: number
}
export const CONTINUE_DEFAULTS: ContinueItem[] = [
  { showId: 'solar-drift', progress: 45 },
  { showId: 'neon-tide', progress: 82 },
  { showId: 'tidal-empire', progress: 15 },
]

export interface WatchlistItem {
  id: string
  showId: string
  note?: string
  priority?: number
  addedAt: string
}

// Per-subject watchlist (module-scoped; persists for the dev server lifetime).
const watchlists = new Map<string, WatchlistItem[]>()
export function listOf(user: string): WatchlistItem[] {
  let list = watchlists.get(user)
  if (!list) {
    list = []
    watchlists.set(user, list)
  }
  return list
}
export function addToWatchlist(
  user: string,
  input: { showId?: string; note?: string; priority?: number },
): { ok: true; item: WatchlistItem } | { ok: false; status: number; error: string } {
  if (!input.showId || !SHOWS.some((s) => s.id === input.showId)) {
    return { ok: false, status: 400, error: 'unknown showId' }
  }
  const list = listOf(user)
  if (list.some((i) => i.showId === input.showId)) {
    return { ok: false, status: 409, error: 'already in list' }
  }
  const item: WatchlistItem = {
    id: randomUUID(),
    showId: input.showId,
    ...(input.note !== undefined ? { note: input.note } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    addedAt: new Date().toISOString(),
  }
  list.push(item)
  return { ok: true, item }
}
export function removeFromWatchlist(user: string, id: string): boolean {
  const list = listOf(user)
  const i = list.findIndex((x) => x.id === id)
  if (i === -1) return false
  list.splice(i, 1)
  return true
}
```

- [ ] **Step 2: Create `apps/nebula/src/lib/invariance-server.ts`** — the shared `withInvariance` config (so every route uses one identity + registry).

```ts
import type { InvarianceFetchConfig } from '@invariance/server'

// Business-logic plane config. getSubject matches the header the console's
// Guardrails + the demo use (x-demo-user). appId "nebula" matches the manifest.
export const invarianceServerConfig: InvarianceFetchConfig = {
  registryUrl: process.env.INVARIANCE_REGISTRY ?? 'http://localhost:4400',
  appId: 'nebula',
  getSubject: (req: Request) => req.headers.get('x-demo-user') ?? undefined,
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm -F @invariance/nebula typecheck`
Expected: PASS (these files only import `./titles` + a type from `@invariance/server`).

- [ ] **Step 4: Commit**

```bash
cd /Users/anuraag/invariance && git add apps/nebula/src/lib/catalog.ts apps/nebula/src/lib/invariance-server.ts && git commit -m "Nebula: content catalog + shared withInvariance config"
```

---

## Task 2: Nebula content API routes (governed by withInvariance)

**Files:**
- Create: `apps/nebula/src/app/api/shows/route.ts`, `apps/nebula/src/app/api/featured/route.ts`, `apps/nebula/src/app/api/continue/route.ts`, `apps/nebula/src/app/api/watchlist/route.ts`, `apps/nebula/src/app/api/watchlist/[id]/route.ts`

- [ ] **Step 1: `apps/nebula/src/app/api/shows/route.ts`**

```ts
import { withInvariance } from '@invariance/server'
import { invarianceServerConfig } from '../../../lib/invariance-server'
import { SHOWS } from '../../../lib/catalog'

export const runtime = 'nodejs'

export const GET = withInvariance(invarianceServerConfig, async () =>
  Response.json({ shows: SHOWS }),
)
```

- [ ] **Step 2: `apps/nebula/src/app/api/featured/route.ts`**

```ts
import { withInvariance } from '@invariance/server'
import { invarianceServerConfig } from '../../../lib/invariance-server'
import { SHOWS, FEATURED_ID } from '../../../lib/catalog'

export const runtime = 'nodejs'

export const GET = withInvariance(invarianceServerConfig, async () =>
  Response.json({ show: SHOWS.find((s) => s.id === FEATURED_ID) ?? SHOWS[0] }),
)
```

- [ ] **Step 3: `apps/nebula/src/app/api/continue/route.ts`**

```ts
import { withInvariance } from '@invariance/server'
import { invarianceServerConfig } from '../../../lib/invariance-server'
import { CONTINUE_DEFAULTS } from '../../../lib/catalog'

export const runtime = 'nodejs'

export const GET = withInvariance(invarianceServerConfig, async () =>
  Response.json({ items: CONTINUE_DEFAULTS }),
)
```

- [ ] **Step 4: `apps/nebula/src/app/api/watchlist/route.ts`** (GET + POST). withInvariance runs request hooks on the POST body before the handler sees it.

```ts
import { withInvariance } from '@invariance/server'
import { invarianceServerConfig } from '../../../lib/invariance-server'
import { listOf, addToWatchlist } from '../../../lib/catalog'

export const runtime = 'nodejs'

const subjectOf = (req: Request) => req.headers.get('x-demo-user') ?? 'anonymous'

export const GET = withInvariance(invarianceServerConfig, async (req) =>
  Response.json({ items: listOf(subjectOf(req)) }),
)

export const POST = withInvariance(invarianceServerConfig, async (req) => {
  const body = (await req.json().catch(() => ({}))) as {
    showId?: string
    note?: string
    priority?: number
  }
  const result = addToWatchlist(subjectOf(req), body)
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  return Response.json({ item: result.item }, { status: 201 })
})
```

- [ ] **Step 5: `apps/nebula/src/app/api/watchlist/[id]/route.ts`** (DELETE). The manifest's `no-hooking-deletes` policy forbids hooks here; `withInvariance` still wraps it (matchEndpoint resolves `/api/watchlist/:id`).

```ts
import { withInvariance } from '@invariance/server'
import { invarianceServerConfig } from '../../../../lib/invariance-server'
import { removeFromWatchlist } from '../../../../lib/catalog'

export const runtime = 'nodejs'

const subjectOf = (req: Request) => req.headers.get('x-demo-user') ?? 'anonymous'

export const DELETE = withInvariance(invarianceServerConfig, async (req) => {
  const id = new URL(req.url).pathname.split('/').pop() ?? ''
  const ok = removeFromWatchlist(subjectOf(req), id)
  if (!ok) return Response.json({ error: 'not found' }, { status: 404 })
  return new Response(null, { status: 204 })
})
```

- [ ] **Step 6: Typecheck + build**

Run: `pnpm -F @invariance/nebula typecheck && pnpm -F @invariance/nebula build`
Expected: PASS; build lists the new API routes (`/api/shows`, `/api/featured`, `/api/continue`, `/api/watchlist`, `/api/watchlist/[id]`).

- [ ] **Step 7: Commit**

```bash
cd /Users/anuraag/invariance && git add apps/nebula/src/app/api/shows apps/nebula/src/app/api/featured apps/nebula/src/app/api/continue apps/nebula/src/app/api/watchlist && git commit -m "Nebula: content API routes governed by withInvariance"
```

---

## Task 3: Nebula AppManifest + seed script

**Files:**
- Create: `apps/nebula/invariance.manifest.json`, `apps/nebula/scripts/seed.mjs`
- Modify: `apps/nebula/package.json` (add `seed` script)

- [ ] **Step 1: Create the manifest by copying Streamline's and renaming the app**

```bash
cd /Users/anuraag/invariance
node -e "const m=require('./apps/demo/invariance.manifest.json'); m.appId='nebula'; require('fs').writeFileSync('apps/nebula/invariance.manifest.json', JSON.stringify(m,null,2)+'\n')"
node -e "const m=require('./apps/nebula/invariance.manifest.json'); console.log('appId',m.appId,'endpoints',m.endpoints.length,'policies',m.policies.length,'tokens',m.designTokens.length)"
```
Expected: `appId nebula endpoints 6 policies 6 tokens 47` (mirrors Streamline; same endpoint ids/paths/policies so the existing Guardrails catalog applies).

- [ ] **Step 2: Create `apps/nebula/scripts/seed.mjs`** (Node, no tsx needed — reads the JSON, POSTs to the control plane)

```js
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const registry = process.env.INVARIANCE_REGISTRY ?? 'http://localhost:4400'
const manifest = JSON.parse(await readFile(join(here, '..', 'invariance.manifest.json'), 'utf8'))

const res = await fetch(`${registry}/v1/apps/nebula/manifest`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(manifest),
})
console.log('manifest publish:', res.status, await res.json())
if (!res.ok) process.exit(1)
```

- [ ] **Step 3: Add the `seed` script to `apps/nebula/package.json`** — insert into the `"scripts"` block:

```json
    "seed": "node scripts/seed.mjs",
```
(Place it after the existing `"start"` line; keep valid JSON.)

- [ ] **Step 4: Verify the seed against a running control plane**

```bash
cd /Users/anuraag/invariance && PORT=4400 pnpm -F @invariance/control-plane dev > /tmp/cp.log 2>&1 &
for i in $(seq 1 30); do curl -s http://localhost:4400/healthz >/dev/null 2>&1 && break; sleep 1; done
pnpm -F @invariance/nebula seed
curl -s http://localhost:4400/v1/apps/nebula/manifest | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=JSON.parse(s);console.log('published appId',m.appId,'v',m.version)})"
kill %1 2>/dev/null
```
Expected: `manifest publish: 201 ...` and `published appId nebula v 1.0.0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/anuraag/invariance && git add apps/nebula/invariance.manifest.json apps/nebula/scripts/seed.mjs apps/nebula/package.json && git commit -m "Nebula: AppManifest (mirrors streamline, appId nebula) + seed script"
```

---

## Task 4: Point the console + Guardrails at Nebula

**Files:**
- Modify: `apps/console/src/App.tsx` (line 13), `apps/console/vite.config.ts`

- [ ] **Step 1: Default the console to appId "nebula"** — in `apps/console/src/App.tsx`, change:

```ts
const DEFAULT_APP = "streamline";
```
to:
```ts
const DEFAULT_APP = "nebula";
```
(The App input stays editable, so streamline is still reachable by typing it.)

- [ ] **Step 2: Point the `/demo-api` proxy at Nebula** — in `apps/console/vite.config.ts`, change the `/demo-api` target default from `http://localhost:4500` to `http://localhost:4321`:

```ts
      "/demo-api": {
        target: process.env.DEMO_API_URL ?? "http://localhost:4321",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/demo-api/, ""),
      },
```

- [ ] **Step 3: Typecheck + build console**

Run: `pnpm -F @invariance/console typecheck && pnpm -F @invariance/console build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/anuraag/invariance && git add apps/console/src/App.tsx apps/console/vite.config.ts && git commit -m "Console: default to appId nebula + point Guardrails /demo-api at :4321"
```

---

## Task 5: Land the console-only restyle (cherry-pick, drop the widget)

The parked branch `feat/console-widget-restyle` (commit `e6dd188`) restyled the console (`App.tsx`, `styles.css`) AND the client widget (`packages/client/src/react/index.tsx`). Per the decision, take the console part only; the widget restyle is superseded (Nebula uses the design `CustomizationPanel`, not `PromptWidget`).

**Files:** (applied via cherry-pick) `apps/console/src/App.tsx`, `apps/console/src/styles.css`, `docs/superpowers/specs/2026-06-13-console-widget-restyle-design.md`

- [ ] **Step 1: Cherry-pick without committing, then drop the widget file**

```bash
cd /Users/anuraag/invariance
git cherry-pick -n e6dd188
# Drop the client widget restyle (keep PromptWidget as-is for Streamline):
git checkout HEAD -- packages/client/src/react/index.tsx
git reset -q HEAD packages/client/src/react/index.tsx 2>/dev/null || true
git status -s
```
Expected staged: `apps/console/src/App.tsx`, `apps/console/src/styles.css`, the restyle spec doc. NOT `packages/client/src/react/index.tsx`.
If cherry-pick reports a conflict (it shouldn't — both branches share the guardrails base), resolve by taking the restyle's version of `App.tsx`/`styles.css`, then continue.

- [ ] **Step 2: Reconcile App.tsx with Task 4's change.** The restyle's `App.tsx` reverts `DEFAULT_APP` to whatever it was on `e6dd188` (likely `"streamline"`). Re-apply the Nebula default: ensure `apps/console/src/App.tsx` has `const DEFAULT_APP = "nebula";` (re-edit if the cherry-pick changed it back).

```bash
grep -n 'DEFAULT_APP =' apps/console/src/App.tsx
```
If it shows `"streamline"`, change it back to `"nebula"`.

- [ ] **Step 3: Typecheck + build console**

Run: `pnpm -F @invariance/console typecheck && pnpm -F @invariance/console build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/anuraag/invariance && git add apps/console docs/superpowers/specs/2026-06-13-console-widget-restyle-design.md && git commit -m "Console: land calmer dashboard restyle (console-only; widget restyle dropped)"
```

---

## Task 6: Reconcile docs (CLAUDE.md + README)

**Files:** Modify `CLAUDE.md`, `README.md`

- [ ] **Step 1: Update `CLAUDE.md`** — in the Layout/Phase section, add `apps/nebula` and the two-plane note. Add this bullet under the layout description (after the `apps/demo` line):

```
apps/nebula        # Nebula — Next.js 14 + Tailwind showcase demo. Customization
                   # via the DESIGN plane (@invariance/design: CustomizationPanel,
                   # m.* slots, /dev menu). Business-logic mods + invariants run on
                   # the BUSINESS-LOGIC plane (Next API routes wrapped with
                   # @invariance/server withInvariance; appId "nebula"), demoed via
                   # the console/Guardrails. apps/demo (Streamline, Vite) is kept as
                   # the platform integration test.
```
Also add a one-line note near the Architecture section: "Two customization planes coexist: `@invariance/design` (UI/theme, client-side) and `@invariance/client`+`@invariance/server`+control-plane (signed-bundle business-logic at the API seam, with invariants). Nebula uses the design plane in-app; its API is governed by the business-logic plane."

- [ ] **Step 2: Update `README.md`** — in the layout list add `apps/nebula`, and in the Quick demo add Nebula:

```sh
# Nebula showcase demo (Next.js + Tailwind) — design-plane customization + the
# /dev menu, with its API governed by the platform's invariants:
pnpm -F @invariance/nebula seed      # publish the nebula manifest to the control plane
pnpm -F @invariance/nebula dev       # http://localhost:4321  (needs Ollama for free-form prompts)
```
Note that the console (`pnpm -F @invariance/console dev`, :4600) now defaults to appId "nebula" and its Guardrails view tests Nebula's invariants live.

- [ ] **Step 3: Commit**

```bash
cd /Users/anuraag/invariance && git add CLAUDE.md README.md && git commit -m "Docs: Nebula showcase + two-plane architecture in CLAUDE.md/README"
```

---

## Task 7: Full-stack verification (the reconciliation works)

No code — drive the reconciled product end to end.

- [ ] **Step 1: Workspace build + test (no regressions)**

Run: `pnpm -w build && pnpm -w test`
Expected: all green. `@invariance/nebula` build includes the new API routes; all suites pass (Streamline's guardrails-catalog e2e still targets appId "streamline" and passes; nebula unit tests pass).

- [ ] **Step 2: Boot the stack**

```bash
cd /Users/anuraag/invariance
PORT=4400 pnpm -F @invariance/control-plane dev > /tmp/cp.log 2>&1 &
for i in $(seq 1 30); do curl -s http://localhost:4400/healthz >/dev/null 2>&1 && break; sleep 1; done
pnpm -F @invariance/nebula seed                                   # publish nebula manifest
INVARIANCE_REGISTRY=http://localhost:4400 pnpm -F @invariance/nebula dev > /tmp/neb.log 2>&1 &
for i in $(seq 1 40); do curl -s -o /dev/null -w '%{http_code}' http://localhost:4321/ 2>/dev/null | grep -q 200 && break; sleep 1; done
CONSOLE_PORT=4600 DEMO_API_URL=http://localhost:4321 pnpm -F @invariance/console dev > /tmp/con.log 2>&1 &
for i in $(seq 1 30); do curl -s -o /dev/null -w '%{http_code}' http://localhost:4600/ 2>/dev/null | grep -q 200 && break; sleep 1; done
echo "cp=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4400/healthz) neb=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4321/) con=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4600/)"
```
Expected: `cp=200 neb=200 con=200`.

- [ ] **Step 3: Confirm Nebula's governed API serves data + an invariant holds at runtime**

```bash
# base shows
curl -s -H 'x-demo-user: probe' http://localhost:4321/api/shows | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('shows:',j.shows.length,'first:',j.shows[0].title,j.shows[0].maturity)})"
# register a signed cheat that rewrites titles (passes verify; runtime must roll back)
curl -s -X POST -H 'content-type: application/json' -d '{"hooks":[{"id":"h","trigger":{"endpointId":"list-shows","phase":"response"},"language":"js","source":"(p)=>({shows:p.shows.map(s=>({...s,title:s.title.toUpperCase()}))})"}],"capabilities":{"reads":[{"endpointId":"list-shows"}],"writes":[{"endpointId":"list-shows","fields":["shows"]}],"budgets":{"cpuMs":50,"memMb":32}}}' http://localhost:4400/v1/apps/nebula/subjects/probe/bundles >/dev/null
sleep 1
curl -s -H 'x-demo-user: probe' http://localhost:4321/api/shows | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const rolled=j.shows.some(x=>/[a-z]/.test(x.title));console.log('after cheat — titles still canonical (rolled back)?',rolled)})"
```
Expected: shows count > 0; after the cheat, `rolled back? true` (titles keep lowercase → the immutable-title invariant held at Nebula's seam).

- [ ] **Step 4: Drive the console Guardrails against Nebula (screenshot)**

Open `http://localhost:4600/#/guardrails` with Playwright; confirm the invariant cards render for appId nebula and clicking a runtime "Test it" (e.g. "Rewrite show titles") yields "🛡️ Neutralized at runtime" + a feed entry. Save `/tmp/nebula-guardrails.png` and Read it.

```bash
cat > /tmp/gr.mjs <<EOF
import { createRequire } from 'module'
const require = createRequire('/Users/anuraag/invariance/apps/nebula/')
const { chromium } = require('playwright')
const b = await chromium.launch(); const p = await (await b.newContext({viewport:{width:1440,height:1000}})).newPage()
await p.goto('http://localhost:4600/#/guardrails', { waitUntil:'networkidle' })
await p.waitForSelector('.guardrail-card', { timeout:8000 }).catch(()=>{})
const btns = await p.\$\$('.guardrail-test button')
for (const x of btns){ const t=await x.textContent(); if(/Rewrite show titles/i.test(t||'')){ await x.click(); break } }
await p.waitForTimeout(3500)
await p.screenshot({ path:'/tmp/nebula-guardrails.png' })
await b.close(); console.log('shot ok')
EOF
node /tmp/gr.mjs
```
Read `/tmp/nebula-guardrails.png`: expect the Guardrails view (invariant cards + live feed) with a 🛡️ "Neutralized at runtime" verdict and a BLOCKED feed line. Stop all servers (`kill %1 %2 %3` / by port).

- [ ] **Step 5: Confirm Nebula still renders + themes** (regression check of Phase 1)

Quick Playwright screenshot of `http://localhost:4321/` (the Nebula home) — confirm the streaming UI still renders (the design plane is unaffected by Phase 2). Read it.

- [ ] **Step 6: Final commit (tidy-ups only)**

```bash
cd /Users/anuraag/invariance && git add -A && git commit -m "Nebula Phase 2: reconciliation verified end-to-end" || echo "nothing to commit"
```

---

## Phase 2 exit criteria

- Nebula has a governed content API (`/api/shows|featured|continue|watchlist`) wrapped with `withInvariance`, and an AppManifest (appId "nebula") of invariants.
- A signed cheat against Nebula's API is rolled back at runtime (invariant held); the console (defaulting to appId "nebula") + Guardrails demo it live.
- The console-only restyle is landed; the widget restyle stays dropped.
- CLAUDE.md + README reflect Nebula-as-showcase + the two-plane architecture.
- `pnpm -w build` + `pnpm -w test` green; Streamline kept as the platform integration test; Nebula's UI (design plane) unchanged.

## Self-review notes (applied)

- **Spec/decision coverage:** business-logic plane on Nebula (Tasks 1–3), developer-side-via-Guardrails (Task 4 + verify Task 7.3–7.4), console→nebula (Task 4), restyle console-only (Task 5), docs (Task 6). No in-app logic prompt (per decision). Streamline kept (its e2e untouched).
- **Reuse:** manifest mirrors Streamline so the existing `apps/console/src/guardrails.ts` catalog + `apps/demo/test/guardrails-catalog.e2e.test.ts` both keep working (same endpoint ids/paths/policies).
- **No placeholders:** every code step has full content; verification uses real curl/Playwright with expected outputs.
- **Consistency:** `appId "nebula"`, subject header `x-demo-user`, `/demo-api`→`:4321`, response shape `{shows:[{title,maturity,...}]}` used consistently across routes, manifest, catalog, and verification.
- **Risk handled:** `runtime='nodejs'` on every governed route (QuickJS WASM needs Node); cherry-pick drops the widget file + re-applies the Nebula default; the watchlist store is module-scoped (dev-only, acceptable).
