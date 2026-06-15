# Console Invariants Unification + /dev-Style Redesign (SP1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Console the single developer surface for all invariants — it already views + Guardrails-tests the code-defined data invariants; add the editable **look-invariants** (backed by a new control-plane design-config) and **redesign the Console to Nebula `/dev`'s clean Tailwind look**. Nebula reads the look-invariants from the control plane and drops its local lock controls.

**Architecture:** Look-invariants move into a control-plane `design-config` (`GET/PUT /v1/apps/:appId/design-config`); the Console edits them (ported `LockControls`); Nebula's `layout.tsx` reads them from the control plane and merges per request (unchanged `mergeInvarianceConfig`). The Console gains Tailwind and is rebuilt in `/dev`'s fixed-neutral dark language. Two enforcement engines stay; both read invariants from the control plane.

**Tech Stack:** zod (`@invariance/schema`), Hono (control plane), React + Vite + **Tailwind 3.4** (console), Next 14 (Nebula), vitest.

**Spec:** `docs/superpowers/specs/2026-06-14-console-invariants-unify-design.md`. **SP2 (theme history → Console, delete `/dev`) is a separate later plan.**

---

## File structure

```
packages/schema/src/design-config.ts          # NEW: DesignConfigSchema + type
packages/schema/src/index.ts                   # MODIFY: export it
packages/schema/test/design-config.test.ts     # NEW
apps/control-plane/src/store.ts                # MODIFY: Store.getDesignConfig/putDesignConfig + MemoryStore impl
apps/control-plane/src/pg/pg-store.ts          # MODIFY: PgStore impl
apps/control-plane/src/pg/schema.sql.ts        # MODIFY: design_config table
apps/control-plane/src/app.ts                  # MODIFY: GET/PUT /v1/apps/:appId/design-config
apps/control-plane/test/design-config-route.test.ts   # NEW
apps/control-plane/test/store-conformance.test.ts     # MODIFY: cover design-config
apps/console/{package.json,postcss.config.js,tailwind.config.ts,src/index.css}  # NEW/MODIFY: Tailwind
apps/console/src/main.tsx                       # MODIFY: import index.css
apps/console/src/api.ts                         # MODIFY: getDesignConfig/putDesignConfig + DesignConfig type
apps/console/src/App.tsx                        # MODIFY: redesign views (Tailwind) + Invariants view + nav
apps/console/src/lock-controls.tsx             # NEW: ported from Nebula, wired to api
apps/console/src/styles.css                    # DELETE after migration to Tailwind
apps/nebula/src/app/layout.tsx                  # MODIFY: read design-config from control plane
apps/nebula/src/app/dev/page.tsx               # MODIFY: drop LockControls (keep theme history)
apps/nebula/src/{app/api/dev-config,lib/server/dev-config-store.ts,components/dev/lock-controls.tsx}  # DELETE
```

---

## Task 1: `DesignConfig` schema in @invariance/schema

**Files:** Create `packages/schema/src/design-config.ts`, `packages/schema/test/design-config.test.ts`; modify `packages/schema/src/index.ts`

- [ ] **Step 1: Write the failing test** — `packages/schema/test/design-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DesignConfigSchema } from "../src/design-config";

describe("DesignConfigSchema", () => {
  it("accepts a full config", () => {
    const v = DesignConfigSchema.parse({
      pageLevels: { "/": 4, "/series": 2 },
      accentLock: "#e94560",
      lockedSections: ["hero", "row-trending"],
      chromaCap: 0.18,
      contrastFloor: 4.5,
    });
    expect(v.accentLock).toBe("#e94560");
  });

  it("defaults to an empty config", () => {
    expect(DesignConfigSchema.parse({})).toEqual({});
  });

  it("rejects a bad accent hex and out-of-range numbers", () => {
    expect(DesignConfigSchema.safeParse({ accentLock: "red" }).success).toBe(false);
    expect(DesignConfigSchema.safeParse({ chromaCap: 0.9 }).success).toBe(false);
    expect(DesignConfigSchema.safeParse({ contrastFloor: 99 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `pnpm -F @invariance/schema test design-config` → module not found.

- [ ] **Step 3: Implement** `packages/schema/src/design-config.ts`:

```ts
import { z } from "zod";

/**
 * Developer-tunable "look" invariants for an app — the runtime layer over the
 * manifest's code-defined design-constraint defaults. Stored control-plane-side
 * and edited in the console; the design plane reads it and merges it into the
 * live config. Shape mirrors Nebula's former local DevConfigOverlay.
 */
export const DesignConfigSchema = z.object({
  /** route -> customization level 0..4 */
  pageLevels: z.record(z.number().int().min(0).max(4)).optional(),
  /** hex that locks --inv-accent; null/absent = unlocked */
  accentLock: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  /** m.slot section names users may not hide/remove */
  lockedSections: z.array(z.string().min(1)).optional(),
  /** caps accent OKLCH chroma (0.10–0.25) */
  chromaCap: z.number().min(0.1).max(0.25).optional(),
  /** minimum WCAG contrast ratio (1–21) */
  contrastFloor: z.number().min(1).max(21).optional(),
});
export type DesignConfig = z.infer<typeof DesignConfigSchema>;
```

- [ ] **Step 4: Export it** — add to `packages/schema/src/index.ts`:

```ts
export { DesignConfigSchema, type DesignConfig } from "./design-config";
```

- [ ] **Step 5: Run, expect PASS** — `pnpm -F @invariance/schema test design-config`.

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/design-config.ts packages/schema/src/index.ts packages/schema/test/design-config.test.ts
git commit -m "schema: DesignConfig (tunable look-invariants)"
```

---

## Task 2: Control-plane store + routes for design-config

**Files:** Modify `apps/control-plane/src/store.ts`, `apps/control-plane/src/pg/pg-store.ts`, `apps/control-plane/src/pg/schema.sql.ts`, `apps/control-plane/src/app.ts`; create `apps/control-plane/test/design-config-route.test.ts`; modify `apps/control-plane/test/store-conformance.test.ts`

- [ ] **Step 1: Failing route test** — `apps/control-plane/test/design-config-route.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createControlPlane } from "../src/app";

describe("design-config route", () => {
  it("defaults to {} then round-trips a PUT", async () => {
    const cp = createControlPlane();
    const r0 = await cp.app.fetch(new Request("http://x/v1/apps/nebula/design-config"));
    expect(r0.status).toBe(200);
    expect(await r0.json()).toEqual({});

    const put = await cp.app.fetch(
      new Request("http://x/v1/apps/nebula/design-config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accentLock: "#e94560", contrastFloor: 7 }),
      }),
    );
    expect(put.status).toBe(200);

    const r1 = await cp.app.fetch(new Request("http://x/v1/apps/nebula/design-config"));
    expect(await r1.json()).toEqual({ accentLock: "#e94560", contrastFloor: 7 });
  });

  it("rejects an invalid config (400)", async () => {
    const cp = createControlPlane();
    const put = await cp.app.fetch(
      new Request("http://x/v1/apps/nebula/design-config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chromaCap: 5 }),
      }),
    );
    expect(put.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm -F @invariance/control-plane test design-config-route` (404).

- [ ] **Step 3: Extend the Store interface + MemoryStore** in `apps/control-plane/src/store.ts`:

Add to the `Store` interface (near `addEvent`/`listEvents`):
```ts
  getDesignConfig(appId: string): Promise<DesignConfig>;
  putDesignConfig(appId: string, config: DesignConfig): Promise<void>;
```
Import the type at the top: `import type { AppManifest, SignedEnvelope, DesignConfig } from "@invariance/schema";`
Add a field to `AppState`: `designConfig: DesignConfig;` and initialise it `designConfig: {},` in `app()`.
Add the MemoryStore methods:
```ts
  async getDesignConfig(appId: string): Promise<DesignConfig> {
    return this.app(appId).designConfig;
  }
  async putDesignConfig(appId: string, config: DesignConfig): Promise<void> {
    this.app(appId).designConfig = config;
  }
```

- [ ] **Step 4: PgStore impl** — in `apps/control-plane/src/pg/schema.sql.ts` add to the schema SQL:
```sql
CREATE TABLE IF NOT EXISTS design_config (
  app_id text PRIMARY KEY,
  config jsonb NOT NULL
);
```
In `apps/control-plane/src/pg/pg-store.ts` add:
```ts
  async getDesignConfig(appId: string): Promise<DesignConfig> {
    const { rows } = await this.pool.query("SELECT config FROM design_config WHERE app_id = $1", [appId]);
    return rows[0]?.config ?? {};
  }
  async putDesignConfig(appId: string, config: DesignConfig): Promise<void> {
    await this.pool.query(
      "INSERT INTO design_config (app_id, config) VALUES ($1, $2) ON CONFLICT (app_id) DO UPDATE SET config = EXCLUDED.config",
      [appId, JSON.stringify(config)],
    );
  }
```
(Import `DesignConfig` from `@invariance/schema` in pg-store.ts.)

- [ ] **Step 5: Routes** — in `apps/control-plane/src/app.ts`, import `DesignConfigSchema` from `@invariance/schema`, and add after the `/events` GET route:
```ts
  app.get("/v1/apps/:appId/design-config", async (c) =>
    c.json(await store.getDesignConfig(c.req.param("appId"))),
  );
  app.put("/v1/apps/:appId/design-config", async (c) => {
    const config = DesignConfigSchema.parse(await c.req.json());
    await store.putDesignConfig(c.req.param("appId"), config);
    return c.json(config);
  });
```
(The existing `onError` already turns a `ZodError` into a 400.)

- [ ] **Step 6: Cover both stores** — in `apps/control-plane/test/store-conformance.test.ts`, add a case to the shared suite:
```ts
  it("round-trips design-config (defaults to {})", async () => {
    const store = await makeStore();
    expect(await store.getDesignConfig("app1")).toEqual({});
    await store.putDesignConfig("app1", { contrastFloor: 7 });
    expect(await store.getDesignConfig("app1")).toEqual({ contrastFloor: 7 });
  });
```
(Match the file's existing store-factory naming if it differs from `makeStore`.)

- [ ] **Step 7: Run, expect PASS** — `pnpm -F @invariance/control-plane test design-config && pnpm -F @invariance/control-plane test store-conformance`.

- [ ] **Step 8: Commit**

```bash
git add apps/control-plane/src apps/control-plane/test
git commit -m "Control plane: design-config store + GET/PUT routes"
```

---

## Task 3: Add Tailwind to the console (the /dev design system)

**Files:** Modify `apps/console/package.json`; create `apps/console/postcss.config.js`, `apps/console/tailwind.config.ts`, `apps/console/src/index.css`; modify `apps/console/src/main.tsx`

- [ ] **Step 1: Add deps** — in `apps/console/package.json` devDependencies add:
```json
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
```

- [ ] **Step 2: `apps/console/postcss.config.js`**:
```js
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } }
```

- [ ] **Step 3: `apps/console/tailwind.config.ts`** — the `/dev` fixed-neutral system:
```ts
import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ink: '#0a0b0d', surface: '#15161a' },
      fontFamily: {
        display: ["'Space Grotesk'", 'system-ui', 'sans-serif'],
        mono: ["'JetBrains Mono'", 'ui-monospace', 'SF Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
export default config
```

- [ ] **Step 4: `apps/console/src/index.css`**:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root { color-scheme: dark; }
body { margin: 0; background: #0a0b0d; color: #fff; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
```

- [ ] **Step 5: Import it** — in `apps/console/src/main.tsx`, replace `import "./styles.css"` with `import "./index.css"`. Add the Google Fonts link to `apps/console/index.html` `<head>`:
```html
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

- [ ] **Step 6: Verify Tailwind compiles** — temporarily ensure `App.tsx` root has a Tailwind class (it will after Task 4). For now: `pnpm -F @invariance/console build` → succeeds (Tailwind processes; `styles.css` still present/unused until Task 4 deletes it). Expected: build OK.

- [ ] **Step 7: Commit**

```bash
git add apps/console/package.json apps/console/postcss.config.js apps/console/tailwind.config.ts apps/console/src/index.css apps/console/src/main.tsx apps/console/index.html pnpm-lock.yaml
git commit -m "Console: add Tailwind (the /dev design system)"
```

---

## Task 4: Redesign the console views in the /dev Tailwind language

Convert `apps/console/src/App.tsx` views from the old CSS classes to Tailwind, matching `/dev`. This is mechanical — apply the **pattern library** below consistently; then delete `styles.css`.

**Pattern library (use verbatim):**
- Page shell: `<div className="min-h-screen bg-ink text-white px-6 py-10 sm:px-10"><div className="mx-auto max-w-6xl flex flex-col gap-8">…`
- Eyebrow label: `<p className="font-mono text-xs uppercase tracking-[0.34em] text-white/50">Invariance · Console</p>`
- H1: `<h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl font-display">…</h1>` ; section H2: `text-sm font-semibold text-white` ; sub-head: `text-xs font-medium uppercase tracking-wide text-white/40`.
- Panel/card: `rounded-xl bg-white/[0.04] p-5 ring-1 ring-white/10` ; hint text: `text-sm text-white/60` ; muted: `text-white/50`.
- Primary button: `rounded-md bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-emerald-400 disabled:opacity-40` ; secondary: `rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white`.
- Input/select: `rounded-md border border-white/15 bg-surface px-2 py-1 text-xs text-white`.
- Table: `th` → `text-left text-[11px] uppercase tracking-wide text-white/40 border-b border-white/10 px-3 py-2` ; `td` → `px-3 py-3 border-b border-white/5 align-top` ; row hover `hover:bg-white/[0.02]`.
- Status chip: `rounded-full px-2.5 py-0.5 text-xs ring-1` + per-status tint (active `text-emerald-300 ring-emerald-500/30 bg-emerald-500/10`, stale `text-amber-300 ring-amber-500/30 bg-amber-500/10`, degraded/disabled `text-red-300 ring-red-500/30 bg-red-500/10` / `text-white/40 ring-white/10`).
- Error banner: `rounded-xl bg-red-500/10 p-4 text-sm text-red-300 ring-1 ring-red-500/30`.

- [ ] **Step 1: Restyle the header + shell** — in `App.tsx`'s top-level `return`, replace the `.console`/`header`/`h1` markup with the page-shell + eyebrow + H1 + a nav row using the patterns. Nav links (`Dashboard`, `Invariants`, `Guardrails`) use the secondary-button pattern; active link gets `text-white`.

- [ ] **Step 2: Restyle `Dashboard` + `SummaryPanel` + `Stat` + `Ranked`** — panels → card pattern; `Stat` → `rounded-lg bg-white/[0.04] ring-1 ring-white/10 p-3` with value `text-2xl font-semibold` + label `text-xs text-white/50`; `Ranked` bars → `bg-emerald-500/40 h-1.5 rounded`; sub-heads use the eyebrow/sub-head pattern.

- [ ] **Step 3: Restyle `ModsTable` + `StatusChip` + `ManifestPanel` + `ModContentsView`** — apply the table + chip + card patterns; `describePolicy` text in `text-white/70`; `code` spans → `rounded bg-white/10 px-1.5 py-0.5 font-mono text-[12px]`.

- [ ] **Step 4: Restyle `SubjectView` + `GuardrailsView` + `GuardrailCard`** — feed lines: block `bg-red-500/10 ring-1 ring-red-500/20`, muted `bg-white/[0.03]`; verdicts `text-emerald-300` / `text-red-300`; tags `tag-authoring` → `bg-sky-500/15 text-sky-300`, `tag-runtime` → `bg-violet-500/15 text-violet-300`. Keep all existing logic/props identical — only classes change.

- [ ] **Step 5: Delete the old stylesheet** — `git rm apps/console/src/styles.css` (no longer imported). Grep `App.tsx` for leftover `className="panel"`-style old classes and convert any stragglers.

- [ ] **Step 6: Typecheck + build + eyeball** — `pnpm -F @invariance/console typecheck && pnpm -F @invariance/console build`. Then (with control plane running) screenshot `http://localhost:4600/` via Playwright and Read it: confirm the deep-black `/dev` aesthetic (eyebrow, cards, emerald accents, clean spacing) — not the old look.

- [ ] **Step 7: Commit**

```bash
git add apps/console/src && git rm -q apps/console/src/styles.css 2>/dev/null; git commit -m "Console: redesign all views in the /dev Tailwind language"
```

---

## Task 5: Console Invariants view (port LockControls, wire to design-config)

**Files:** Modify `apps/console/src/api.ts`, `apps/console/src/App.tsx`; create `apps/console/src/lock-controls.tsx`

- [ ] **Step 1: api helpers** — in `apps/console/src/api.ts` add the type + members:
```ts
export interface DesignConfig {
  pageLevels?: Record<string, number>;
  accentLock?: string | null;
  lockedSections?: string[];
  chromaCap?: number;
  contrastFloor?: number;
}
```
In the `api` object:
```ts
  designConfig: (appId: string) => get<DesignConfig>(`/v1/apps/${appId}/design-config`),
  putDesignConfig: async (appId: string, config: DesignConfig): Promise<DesignConfig> => {
    const res = await fetch(`/v1/apps/${appId}/design-config`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`design-config PUT ${res.status}`);
    return (await res.json()) as DesignConfig;
  },
```

- [ ] **Step 2: Port `LockControls`** — copy `apps/nebula/src/components/dev/lock-controls.tsx` to `apps/console/src/lock-controls.tsx` and adapt:
  - Replace `import type { DevConfigOverlay } from '../../lib/dev-config'` with `import type { DesignConfig } from "./api"` (use `DesignConfig` throughout instead of `DevConfigOverlay`).
  - Keep all the Tailwind markup verbatim (it already matches the console's new system) and the local-state logic.
  - It already takes `overlay`, `baseLevels`, `currentAccent`, `onSave` — keep that interface.
  - Make `LOCKABLE_SECTIONS` a prop (`sections: string[]`) instead of the Nebula hardcode, so the console feeds it from the manifest.

- [ ] **Step 3: Invariants view in `App.tsx`** — add `#/invariants` to the hash router (alongside `#/guardrails`) and a `<InvariancesView appId>` that:
  - Loads `api.manifest(appId)` + `api.designConfig(appId)`.
  - Renders a card with **read-only data-invariants** (the manifest policies via the existing `describePolicy`, labeled "Declared in code — enforced, not editable here").
  - Renders `<LockControls overlay={designConfig} baseLevels={…} currentAccent={null} sections={…} onSave={(c)=>api.putDesignConfig(appId,c).then(()=>reload)} />`, where `baseLevels` is built from the manifest's endpoints/pages context (default each known route to its level; if the manifest has no page model, default `{}`) and `sections` from the manifest's component slot names.
  - A line linking to `#/guardrails` ("Test that these hold →").
  - Add a `Invariants` nav link in the header.

- [ ] **Step 4: Typecheck + build** — `pnpm -F @invariance/console typecheck && pnpm -F @invariance/console build` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/console/src
git commit -m "Console: Invariants view — editable look-invariants (design-config) + read-only policy contracts"
```

---

## Task 6: Nebula reads design-config from the control plane

**Files:** Modify `apps/nebula/src/app/layout.tsx`, `apps/nebula/src/app/dev/page.tsx`; delete `apps/nebula/src/app/api/dev-config/route.ts`, `apps/nebula/src/lib/server/dev-config-store.ts`, `apps/nebula/src/components/dev/lock-controls.tsx`

- [ ] **Step 1: layout.tsx reads the control plane** — replace the dev-config load. Change:
```ts
import { readDevConfig } from '../lib/server/dev-config-store'
...
const overlay = await readDevConfig()
const config = mergeInvarianceConfig(invarianceConfig, overlay)
```
to:
```ts
import type { DevConfigOverlay } from '../lib/dev-config'
...
const registry = process.env.INVARIANCE_REGISTRY ?? 'http://localhost:4400'
let overlay: DevConfigOverlay = {}
try {
  const res = await fetch(`${registry}/v1/apps/nebula/design-config`, { cache: 'no-store' })
  if (res.ok) overlay = (await res.json()) as DevConfigOverlay
} catch {
  // fail open to base config if the control plane is unreachable
}
const config = mergeInvarianceConfig(invarianceConfig, overlay)
```
(`mergeInvarianceConfig` + the `DevConfigOverlay` type in `lib/dev-config.ts` stay — only the *source* of the overlay changes. The control-plane `DesignConfig` shape matches `DevConfigOverlay`.)

- [ ] **Step 2: Strip the lock controls from `/dev`** — in `apps/nebula/src/app/dev/page.tsx` remove the `<LockControls .../>` import + render and the `handleSaveOverlay`/`overlay`/`/api/dev-config` fetch logic. Keep the **Version history** section (theme timeline) — that stays until SP2. Replace the locks column with a short note + a link to the console: `<a href="http://localhost:4600/#/invariants">Manage invariants in the Console →</a>`.

- [ ] **Step 3: Delete the now-dead files**

```bash
cd /Users/anuraag/invariance
git rm apps/nebula/src/app/api/dev-config/route.ts apps/nebula/src/lib/server/dev-config-store.ts apps/nebula/src/lib/server/dev-config-store.test.ts apps/nebula/src/components/dev/lock-controls.tsx 2>/dev/null
```
Grep for stragglers: `grep -rn "dev-config-store\|api/dev-config\|components/dev/lock-controls" apps/nebula/src` → fix any imports (the `lib/dev-config.ts` `mergeInvarianceConfig` + type remain and are still used by layout.tsx).

- [ ] **Step 4: Typecheck + build** — `pnpm -F @invariance/nebula typecheck && pnpm -F @invariance/nebula build` → PASS (routes no longer include `/api/dev-config`).

- [ ] **Step 5: Commit**

```bash
git add apps/nebula && git commit -m "Nebula: read look-invariants from control-plane design-config; drop local lock controls/store"
```

---

## Task 7: Full-stack verification

- [ ] **Step 1: Workspace build + test** — `pnpm -w build && pnpm -w test` → all green (new schema + control-plane tests pass; nebula/streamline/console build).

- [ ] **Step 2: Boot** control plane (:4400) + seed nebula manifest + nebula (:4321) + console (:4600). Confirm all 200.

- [ ] **Step 3: Console looks like /dev** — Playwright screenshot `http://localhost:4600/` and `#/invariants`; Read them. Confirm the deep-black, white-opacity, emerald-accent, Space-Grotesk `/dev` aesthetic (clean + smooth), and that the Invariants view shows the read-only policy contracts + the editable lock controls.

- [ ] **Step 4: Round-trip a look-invariant through the Console → Nebula** — in the Invariants view set the contrast floor to AAA (7.0) and Apply (or `curl -X PUT .../design-config`). Then confirm Nebula honors it:
```bash
curl -s -X PUT -H 'content-type: application/json' -d '{"contrastFloor":7}' http://localhost:4400/v1/apps/nebula/design-config >/dev/null
curl -s http://localhost:4400/v1/apps/nebula/design-config
# Nebula reads it per request: the merged config now floors contrast at 7 (verify via /dev or a re-themed render)
```
Expected: GET returns `{"contrastFloor":7}`; a fresh Nebula page load merges it (design plane compiles to AAA). Screenshot Nebula to confirm it still renders.

- [ ] **Step 5: Guardrails still works** — `#/guardrails` (appId nebula): a runtime "Test it" still neutralizes (data-invariant enforcement unaffected).

- [ ] **Step 6: Final commit** — `git add -A && git commit -m "Console invariants unification: verified end-to-end" || echo "nothing to commit"`

---

## Phase exit criteria

- The Console (clean `/dev` look) is the single place to view code-defined data invariants (+ Guardrails-test them) and **edit** look-invariants.
- Look-invariants persist in the control plane; Nebula reads them from there; Nebula's local lock controls/store are gone.
- `pnpm -w build`/`test` green; the two enforcement engines unchanged; Streamline untouched.
- **SP2 (separate plan):** theme history → Console + rollback endpoint, then delete `/dev` entirely.

## Self-review notes (applied)

- **Spec coverage:** design-config schema (T1) + store/routes (T2); Tailwind (T3) + redesign (T4); editor + Invariants view (T5); Nebula rewire + local-store removal (T6); verify (T7). SP2 explicitly deferred.
- **No placeholders:** full code for schema/store/routes/api/Nebula-layout + a concrete Tailwind pattern library for the restyle (mechanical, applied view-by-view) + the LockControls port is an existing file + a 3-line adaptation.
- **Consistency:** `DesignConfig` shape identical across schema/store/api/Nebula `DevConfigOverlay`; endpoint `/v1/apps/:appId/design-config`; emerald accent + `bg-ink`/`bg-white/[0.04]` patterns reused throughout.
- **Risk handled:** Nebula fetch is `no-store` + fails open; `baseLevels`/`sections` come from the manifest (prop), not hardcoded; old `styles.css` removed only after views convert.
