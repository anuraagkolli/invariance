# Governed-Theming Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the as-built two-plane stack to the B2B **governed-theming** product (Tier A) from [`../../DESIGN-GOVERNED-CUSTOMIZATION.md`](../../DESIGN-GOVERNED-CUSTOMIZATION.md): a vendor's app is themed **per-tenant by redefining its existing CSS variables**, non-invasively, without breaking the live substrate.

**Architecture:** Mostly *additive + reframing*. Reuse the design compiler, verifier, per-subject theme store, and apply path — extending the compiler/verifier only with a **thin adapter** (Phase 2b) that feeds their existing `locked_tokens` + `allowed_modes` constraints from the new fields, since the verifier locks in `--inv-*` role-token space, not the vendor-variable space the map uses. Add one new artifact (the `variable→role` map), a variable-discovery scanner, an applier *indirection* (role → the vendor's variable name), a drop-in SDK, a per-tenant **CDN distribution** step for the apply path (Phase 6), and reframe the Console as the governance dashboard. `subject = tenant` is a semantic mapping over the existing per-subject theme store — no store change.

**Tech Stack:** TypeScript (strict, ESM), zod (schema-first), vitest, pnpm + turbo. Existing packages: `@invariance/schema`, `@invariance/design`, `@invariance/design-schema`, `apps/control-plane`, `apps/console`, `packages/cli`.

---

## Migration strategy — keep the substrate live

This migrates a *working* stack, not a greenfield. Principles:

1. **Additive-first.** New capability is new schema fields + new modules; the existing design pipeline (compiler → verify → theme store → apply) is reused as-is **except** for a thin constraint adapter (Phase 2b) that feeds the verifier/compiler the new lock + mode constraints, and a CDN distribution step (Phase 6) in front of the apply fetch. Nothing existing is deleted until its replacement is proven.
2. **Substrate stays runnable.** Nebula + the two-plane stack keep working throughout; the new reference app (Phase 5) is introduced *in parallel*, not by mutating Nebula.
3. **`subject = tenant` is semantic**, not a store change — the theme store already keys by subject (`appendThemeVersion(appId, userId, …)`, `store.ts:244`). "Tenant" is just the subject value the SDK passes.
4. **Business-logic plane (Tier C) is parked, not removed.** It stays in the tree (deferred) and is excluded from the GTM surface — no deletions required.
5. **Each phase ships working, tested software** and is independently mergeable.

## Current → target delta

| Subsystem | Current | Target | Change |
|---|---|---|---|
| Theme store (subject) | keyed by `userId` per subject (`store.ts:244-301`) | `subject = tenant` | **semantic only** |
| Look-invariants (`DesignConfig`, `design-config.ts`) | `pageLevels`, `accentLock`, `chromaCap`, `contrastFloor`, `lockedSections` | **+ `variableRoleMap`, `allowedModes`** | additive schema |
| Scanner (`packages/cli`) | regex `scanRepo` + AST color observe → infer `StyleSpec` + manifest | variable discovery → classify → `variableRoleMap` + coverage report | rework (reuse `cluster.ts`) |
| Apply (`design/src/runtime/apply.ts`) | `setProperty` on `--inv-*` names | `setProperty` on the *vendor's* var names via the map | indirection added |
| Enforcement (compiler/verifier) | locks/modes via `--inv-*` `locked_tokens` + `allowed_modes` (`config/derive-constraints.ts:16-17`); accent-only chroma exempt | + derive those from `variableRoleMap.locked` + `allowedModes` | **thin adapter (Phase 2b)** |
| Distribution (apply fetch) | design plane reads themes direct from control-plane `GET …/themes` | per-tenant pointer → CDN-cached immutable theme | **new (Phase 6)** |
| Integration | hand-wired provider + `m.slot` (Nebula) | one snippet/provider, **no wrapping** | new SDK |
| Console | invariants / themes / guardrails views | + connect/scan, mapping confirm, tenant theme browser | reframe/extend |
| Reference app | Nebula (hand-wired, two-plane) | Tailwind-v4/shadcn sample (variable-themed) | new app, parallel |
| Business-logic plane | active (Tier C) | parked/deferred | none (excluded from GTM) |

## Phase map — each phase is a mergeable sub-plan

| # | Phase | Delivers | Detailed here? |
|---|---|---|---|
| **0** | **Schema foundation** | `variableRoleMap` + `allowedModes` in `DesignConfig`; `subject=tenant` proven | **Yes (full task detail below)** |
| 1 | Scanner rework | discover live vars → classify → proposed `variableRoleMap` + `StyleSpec` + coverage | own sub-plan |
| 2 | Applier indirection | apply a compiled theme by writing the vendor's variable names via the map | own sub-plan |
| **2b** | **Invariant enforcement wiring** | derive the verifier's `locked_tokens` + `allowed_modes` from `variableRoleMap.locked` / `allowedModes` so the new invariants actually bind (not decorative) | own sub-plan |
| 3 | SDK | one `<script>`/provider: resolve tenant → fetch theme → inject mapped vars → mount widget | own sub-plan |
| 4 | Governance dashboard | Console reframe: connect/scan + coverage, mapping confirm, invariant editor, tenant browser, kill | own sub-plan |
| 5 | Reference app | a Tailwind-v4/shadcn sample as the living e2e test (Nebula analog), scoped to the ICP | own sub-plan |
| 6 | Hardening | per-tenant CDN distribution (no prod transit), SSR no-flash, lazy revalidation on invariant change, kill-switch, analytics | own sub-plan |

Per the writing-plans scope check, Phases 1–6 (including 2b) are **independent subsystems**; each becomes its own task-level plan (`docs/superpowers/plans/…`) when we reach it. This document is the **roadmap + Phase 0 in full detail**. Phase-level scoping for 1–6 follows the Phase 0 section.

---

## Phase 0 — Schema foundation (full task detail)

**Why first:** every later phase reads/writes `variableRoleMap`. It's the contract. It's purely additive to `DesignConfigSchema`, which already flows through the `GET/PUT /v1/apps/:appId/design-config` endpoints (`app.ts:293-300`) and the `MemoryStore` (`store.ts:236-242`) unchanged — so landing the schema lights up the whole config path for free.

### Task 0.1: Add `variableRoleMap` + `allowedModes` to `DesignConfig`

**Files:**
- Modify: `packages/schema/src/design-config.ts`
- Modify: `packages/schema/src/index.ts` (export the new symbols)
- Test: `packages/schema/test/design-config.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
// packages/schema/test/design-config.test.ts
import { describe, it, expect } from "vitest";
import { DesignConfigSchema } from "../src/design-config";

describe("DesignConfig variableRoleMap", () => {
  it("accepts a variable→role map and defaults scope/locked", () => {
    const cfg = DesignConfigSchema.parse({
      variableRoleMap: {
        "--primary": { role: "accent", scope: ":root", locked: true },
        "--background": { role: "surface-0" }, // scope + locked defaulted
      },
      allowedModes: ["light", "dark"],
    });
    expect(cfg.variableRoleMap!["--primary"]).toEqual({
      role: "accent", scope: ":root", locked: true,
    });
    expect(cfg.variableRoleMap!["--background"]).toEqual({
      role: "surface-0", scope: ":root", locked: false,
    });
    expect(cfg.allowedModes).toEqual(["light", "dark"]);
  });

  it("rejects a role entry with no role name", () => {
    expect(() =>
      DesignConfigSchema.parse({ variableRoleMap: { "--x": { scope: ":root" } } }),
    ).toThrow();
  });

  it("still accepts a bare {} (back-compat)", () => {
    expect(DesignConfigSchema.parse({})).toEqual({});
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @invariance/schema test design-config`
Expected: FAIL — `variableRoleMap` is stripped/unknown (the first assertion fails).

- [ ] **Step 3: Implement the schema additions**

In `packages/schema/src/design-config.ts`, add above `DesignConfigSchema`:

```ts
export const VariableRoleSchema = z.object({
  /** Design role this variable drives, e.g. "accent", "surface-0", "text-primary". */
  role: z.string().min(1),
  /** CSS selector scope where the variable is defined. */
  scope: z.string().min(1).default(":root"),
  /** Brand-locked: customization may never change this variable. */
  locked: z.boolean().default(false),
});
export type VariableRole = z.infer<typeof VariableRoleSchema>;

/** Vendor CSS variable name (e.g. "--primary") -> the design role it drives. */
export const VariableRoleMapSchema = z.record(VariableRoleSchema);
export type VariableRoleMap = z.infer<typeof VariableRoleMapSchema>;
```

Then add two fields inside the `DesignConfigSchema` object (after `contrastFloor`):

```ts
  /** Onboarding output: the vendor's CSS variables, each bound to a design role. */
  variableRoleMap: VariableRoleMapSchema.optional(),
  /** Modes customization may use (subset of light/dark). */
  allowedModes: z.array(z.enum(["light", "dark"])).optional(),
```

> **Note — these fields are declarative until Phase 2b.** `variableRoleMap[var].locked`
> and `allowedModes` are in *vendor-variable* / config space; the verifier enforces
> locks + modes in `--inv-*` role-token space (`verify/compiled-tests.ts:86-126`,
> `config/derive-constraints.ts:16-17`). Adding these fields enforces **nothing** on
> its own — Phase 2b wires them into the compiler's existing `locked_tokens` /
> `allowed_modes` constraints. The per-entry `locked` flag **generalizes** the existing
> `accentLock` (which pins `--inv-accent`); `lockedSections` stays Tier-B/layout and is
> out of Tier-A scope.
>
> **Note — home of the map.** We keep `variableRoleMap` in `DesignConfig`
> (console-editable, reuses the live `/design-config` path) even though the design doc
> §7 frames it as app-level *"declared once"* governance (manifest territory). This is
> an **intentional MVP choice** for reuse, not an oversight — revisit if onboarding
> needs the map published/immutable alongside the manifest.

- [ ] **Step 4: Export the new symbols**

In `packages/schema/src/index.ts`, confirm it re-exports design-config (it should use `export * from "./design-config";`). If a `export *` line for `./design-config` is missing, add it.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm -F @invariance/schema test design-config`
Expected: PASS (all three cases).

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/design-config.ts packages/schema/src/index.ts packages/schema/test/design-config.test.ts
git commit -m "feat(schema): add variableRoleMap + allowedModes to DesignConfig"
```

### Task 0.2: Prove the new field round-trips through the control-plane config endpoint

**Files:**
- Test: `apps/control-plane/test/design-config.test.ts` (create if absent; mirror the harness of the nearest existing `apps/control-plane/test/*.test.ts`)

- [ ] **Step 1: Write the failing test**

```ts
// apps/control-plane/test/design-config.test.ts
import { describe, it, expect } from "vitest";
import { createControlPlane } from "../src/app";

describe("PUT/GET /design-config carries variableRoleMap", () => {
  it("round-trips the variable→role map", async () => {
    const { app } = createControlPlane();
    const body = {
      variableRoleMap: { "--primary": { role: "accent", scope: ":root", locked: true } },
      allowedModes: ["light"],
    };
    const put = await app.request("/v1/apps/acme/design-config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(put.status).toBe(200);

    const get = await app.request("/v1/apps/acme/design-config");
    const got = await get.json();
    expect(got.variableRoleMap["--primary"]).toEqual({
      role: "accent", scope: ":root", locked: true,
    });
  });
});
```

- [ ] **Step 2: Run it to verify it passes immediately**

Run: `pnpm -F @invariance/control-plane test design-config`
Expected: PASS — the `PUT` handler already does `DesignConfigSchema.parse` (`app.ts:296-300`), so the new field flows with no endpoint change. (If the import path/harness differs, adapt to the nearest existing control-plane test; the assertion is the point.)

- [ ] **Step 3: Commit**

```bash
git add apps/control-plane/test/design-config.test.ts
git commit -m "test(control-plane): variableRoleMap round-trips through /design-config"
```

### Task 0.3: Prove `subject = tenant` isolation on the theme store

**Files:**
- Test: `apps/control-plane/test/tenant-isolation.test.ts` (create)

- [ ] **Step 1: Write the test (documents native multi-tenancy)**

```ts
// apps/control-plane/test/tenant-isolation.test.ts
import { describe, it, expect } from "vitest";
import { MemoryStore } from "../src/store";

describe("subject = tenant isolation", () => {
  it("keeps two tenants' theme timelines independent", async () => {
    const store = new MemoryStore();
    await store.appendThemeVersion("acme-saas", "tenant-a", { mode: "dark" });
    await store.appendThemeVersion("acme-saas", "tenant-b", { mode: "light" });

    expect(await store.getLatestTheme("acme-saas", "tenant-a")).toEqual({ mode: "dark" });
    expect(await store.getLatestTheme("acme-saas", "tenant-b")).toEqual({ mode: "light" });
    expect((await store.listThemeVersions("acme-saas", "tenant-a")).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it passes**

Run: `pnpm -F @invariance/control-plane test tenant-isolation`
Expected: PASS — the store keys timelines by `userId` (`store.ts:251`), so distinct tenant ids are already isolated.

- [ ] **Step 3: Commit**

```bash
git add apps/control-plane/test/tenant-isolation.test.ts
git commit -m "test(control-plane): subject=tenant theme isolation (native multi-tenancy)"
```

**Phase 0 exit criteria:** `DesignConfig` carries `variableRoleMap` + `allowedModes`; it round-trips through `/design-config`; tenant isolation is asserted. `pnpm test` green. No existing behavior changed (all additions optional).

---

## Phases 1–6 — scoped sub-plans (to be task-detailed when reached)

> Each block names the goal, the files, the approach (grounded in existing code), and the exit criteria. These become full task-level plans (their own files) at execution time.

### Phase 1 — Scanner rework (variable discovery → classification → coverage)

- **Goal:** from a target app, produce a *proposed* `variableRoleMap` + baseline `StyleSpec` + a coverage report.
- **Files:** Create `packages/cli/src/discover/vars.ts` (collect declared CSS custom properties — static from built CSS for MVP, with a runtime `getComputedStyle` reader as the preferred mode), `…/discover/classify.ts` (value → role via the existing OKLCH engine), `…/discover/coverage.ts`. Modify `packages/cli/src/infer-spec.ts` / the `init` flow to emit the proposed map. Also create a **minimal Tailwind-v4/shadcn sample fixture** (`apps/reference` seed or a `__fixtures__/` app) — just enough variable-themed surface to discover/classify/apply against. **Phase 5 hardens this same fixture into the full living-test reference app**, so Phases 1–3 have a real, runnable target *before* Phase 5 (otherwise their exit criteria reference an app that doesn't exist yet). **Reuse:** `clusterColors` (`packages/design/src/compiler/cluster.ts`) and `inferStyleSpec` (`packages/cli/src/infer-spec.ts:75`).
- **Approach:** classify each discovered variable's *value* with `clusterColors`/role heuristics (the same engine the old scanner used on JSX colors); emit `{ variableRoleMap, styleSpec, coverage }`.
- **Exit:** point at a Tailwind-v4/shadcn sample → a proposed `variableRoleMap` + coverage % that a human would accept with light edits.

### Phase 2 — Applier indirection (role → vendor variable)

- **Goal:** apply a compiled theme by writing the *vendor's* variable names via `variableRoleMap`, not `--inv-*`.
- **Files:** Add `packages/design/src/runtime/apply-mapped.ts` (translate role→value through the map → `setProperty` on the vendor's var names); keep `apply.ts` for the identity/`--inv-*` path. **Reuse:** `compileTheme` output + `themeToCssEntries`.
- **Exit:** a compiled theme redefines `--primary` etc. on the Phase 1 sample fixture and repaints with no source edits; missing-map / fetch-failure injects nothing (fail-open) — both asserted.

### Phase 2b — Invariant enforcement wiring (make `locked` + `allowedModes` bind)

- **Why a phase (don't skip):** the compiler + verifier already *consume*
  `locked_tokens` + `allowed_modes`, but only in `--inv-*` role-token space
  (`packages/design/src/config/derive-constraints.ts:16-17`, `compiler/compile.ts:57`,
  `verify/compiled-tests.ts:86-126`). The new `variableRoleMap[var].locked` /
  `DesignConfig.allowedModes` fields are in vendor-variable / config space and are **not
  yet fed into those constraints** — so without this phase a "locked" brand variable is
  silently unenforced and a disallowed mode passes. This is the gap the "reuse the
  verifier unchanged" framing hides: the enforcement *primitives* are reused unchanged,
  but the *translation into them* is new.
- **Goal:** derive the compiler's `locked_tokens` + `allowed_modes` from the new fields
  so a locked vendor variable actually pins (verifier re-checks byte-identical) and
  disallowed modes are rejected.
- **Files:** extend the DesignConfig→`DesignConstraints` bridge (the role-token-space
  analogue is `config/derive-constraints.ts`; find/extend wherever `accentLock` /
  `chromaCap` / `contrastFloor` become constraints today). For each `variableRoleMap`
  entry with `locked: true`, resolve vendor-var → role → its `--inv-*` token and pin the
  tenant's current value into `locked_tokens`; map `allowedModes → allowed_modes`.
  **Reuse:** the `locked_tokens` / `allowed_modes` enforcement in `compile.ts` +
  `compiled-tests.ts` **unchanged** — this phase only populates them.
- **Reconcile the legacy lock:** route `accentLock` through the same `locked_tokens`
  path as the generalized per-variable lock (accent becomes one special case, not a
  parallel mechanism), so there is one lock model, not three.
- **Settle `allowedModes` semantics here:** decide + enforce what an empty array
  and duplicates mean (Phase 0 left the field as a bare `z.array(z.enum(...))`,
  deliberately unenforced). Convention to confirm: *unset = unrestricted*, so an
  empty array should be rejected (or normalized) rather than silently meaning "no
  modes"; this is the phase that consumes the field, so it owns that rule.
- **Exit:** a tenant prompt that would change a `locked: true` variable is
  rejected-or-recompiled with the locked value surviving byte-identical; a prompt
  requesting a disallowed mode is rejected — both asserted **through the existing
  verifier, with no verifier edits**.

### Phase 3 — SDK (drop-in)

- **Goal:** one `<script>` + a React provider: resolve tenant → fetch that tenant's theme (`GET /v1/apps/:appId/themes?userId=<tenant>`) → inject mapped variables (Phase 2) → mount the prompt widget.
- **Distribution caveat (MVP — read before building):** this fetches directly from the
  control plane, which puts Invariance on the tenant's **page-load path** — convenient
  for MVP, but it contradicts the design doc's headline *"no production request transits
  Invariance"* promise (§6/§11) and its CDN pointer→bundle model (§8). Keep the SDK's
  fetch behind a **swappable resolver** so Phase 6's CDN distribution is a transport
  change, not an API change. The as-built design plane reads direct today, so the MVP
  inherits this honestly — but it is a *known gap*, not the target state.
- **Files:** Create `packages/sdk/*` (script-tag bundle + React provider) reusing `packages/client` patterns and the Phase 2 applier. Tenant resolver pluggable (`data-tenant` / `getTenant()`).
- **Exit:** drop the snippet into the Phase 1 sample fixture → per-tenant theme applies; control-plane down → base app (fail-open) — asserted.

### Phase 4 — Governance dashboard (Console reframe)

- **Goal:** Connect/scan + coverage report, `variableRoleMap` confirm/edit, invariant editor (locked vars, contrast floor, allowed modes, chroma cap), per-tenant theme browser, kill-switch.
- **Files:** New `apps/console` views; **reuse** `GET/PUT /v1/apps/:appId/design-config` + the themes endpoints + `summarizeStyleSpec`. Extend the existing Invariants/Themes views rather than replace. **Sync the hand-mirrored config type:** `apps/console/src/api.ts` keeps a hand-maintained `DesignConfig` interface that Phase 0 left drifted (no `variableRoleMap` / `allowedModes`); update it here when the console first reads those fields (harmless until then — TS structural typing tolerates the extra JSON).
- **Exit:** a vendor onboards + governs end-to-end in the UI; edits persist to `design-config`.

### Phase 5 — Reference app (living integration test)

- **Goal:** a Tailwind-v4 / shadcn sample app, variable-themed, as the e2e test (the Nebula analog) scoped to the ICP.
- **Files:** Create `apps/reference/*`; wire only the SDK snippet (no `m.slot`, no route wrapping).
- **Exit:** `"match our brand: navy + gold"` prompt → governed, accessible, per-tenant theme end-to-end; the contrast floor + locked brand var hold.

### Phase 6 — Hardening

- **Goal:** **per-tenant CDN distribution** (short-TTL pointer → immutable CDN-cached theme JSON) so the apply path stops transiting the control plane and delivers the §6/§8/§11 *"no production request transits Invariance"* promise — this closes the Phase 3 MVP gap; SSR no-flash (`<head>` injection / cookie mirror); lazy revalidation on invariant change (reuse the existing reconcile path); kill-switch; analytics of what tenants change.
- **Exit:** the apply fetch hits a CDN pointer/bundle, not the control plane (control-plane outage no longer touches the apply path); flash-free first paint; tightening an invariant recompiles-or-drops tenant themes on next load; kill-switch reverts a tenant to base within the pointer TTL.

---

## Self-review (writing-plans checklist)

- **Spec coverage:** Phases 0, 1, 2, **2b**, 3–6 cover every Tier-A element of `DESIGN-GOVERNED-CUSTOMIZATION.md` §13 (schema, scanner, applier, **invariant enforcement wiring**, SDK, dashboard, reference app, hardening incl. **CDN distribution**). §10's enforcement guarantees (locked vars, allowed modes) bind via Phase 2b — not by assuming the verifier already sees the new fields; the §6/§11 *no-prod-transit* promise lands in Phase 6, with Phase 3 flagging the interim direct-fetch gap. Tier B/C are explicitly deferred there and here.
- **Placeholders:** Phase 0 tasks carry real test + impl code and exact commands. Phases 1–6 are *scoped sub-plans* (goal/files/approach/exit), not placeholder tasks — they get task-level detail when started, per the scope check.
- **Type consistency:** `VariableRoleSchema` / `VariableRoleMapSchema` / `DesignConfig.variableRoleMap` are used consistently across Phase 0 (schema) and referenced identically in Phases 1–4.
