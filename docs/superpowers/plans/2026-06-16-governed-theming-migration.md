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
| Enforcement (compiler/verifier) | verifier/compiler consume `locked_tokens` + `allowed_modes` in `--inv-*` space; the vendor-space→`--inv-*` translation lives in **`apps/nebula/src/lib/dev-config.ts → mergeInvarianceConfig:50-63`** (an app file), NOT `config/derive-constraints.ts` (which only re-reads the already-translated YAML block); accent-only chroma exempt | derive **value-pinned** `locked_tokens` + `allowed_modes` from `variableRoleMap.locked` + `allowedModes` via a **new package-level bridge** | **Phase 2b — more than a thin adapter (see corrected §Phase 2b + §Corrections)** |
| Distribution (apply fetch) | design plane reads themes direct from control-plane `GET …/themes` | per-tenant pointer → CDN-cached immutable theme | **new (Phase 6)** |
| Integration | hand-wired provider + `m.slot` (Nebula) | one snippet/provider, **no wrapping** | new SDK |
| Console | invariants / themes / guardrails views | + connect/scan, mapping confirm, tenant theme browser | reframe/extend |
| Reference app | Nebula (hand-wired, two-plane) | Tailwind-v4/shadcn sample (variable-themed) | new app, parallel |
| Business-logic plane | active (Tier C) | parked/deferred | none (excluded from GTM) |

## Corrections from the 2026-06-16 substrate code-trace

An 11-reader code trace of the as-built substrate (cross-checked against source +
the live pipeline docs) confirmed the reuse story but found five places where this
roadmap's earlier assumptions were wrong or under-specified. Each is folded into the
phase it affects below; summarized here so the corrections are not lost:

1. **Phase 2b's bridge pointer was wrong.** `config/derive-constraints.ts` does NOT
   know about `accentLock`/`chromaCap`/`contrastFloor` — it only re-reads the
   *already-translated* `InvarianceConfig.frontend.design.constraints` (in `--inv-*`
   space). The actual vendor-space→constraints translation lives in
   `apps/nebula/src/lib/dev-config.ts → mergeInvarianceConfig` (lines 50-63), an **app
   file**. There is **no package-level `DesignConfig → DesignConstraints` bridge today.**
   Phase 2b must *create* one in `packages/design` (the Phase-5 reference app will not
   use Nebula's `dev-config.ts`).
2. **A lock needs a *value*, but `variableRoleMap[var].locked` is a boolean.**
   `verifyV2`'s `lockedTokensUntouched` compares `theme.roles[token]` byte-identical to
   `locked_tokens[token]` — it needs the target VALUE, and skips entirely when
   `locked_tokens` is empty (so a value-less lock silently no-ops). The lock value must
   be pinned from the tenant's *current* role-token value at derive time — a stateful
   read neither bridge does today (both are pure config→config). This is the hardest
   unstated dependency in Phase 2b. (The accent lock works today *only because*
   `accentLock` carries a hex.)
3. **An empty `allowedModes: []` is a live footgun.** `compileTheme` (`compile.ts:43`)
   throws if `allowed_modes` is set and doesn't include the spec's mode, so `[]` would
   make *every* compile/reconcile throw → every tenant drops to base. Phase 0 shipped the
   permissive schema (`z.array(z.enum(...)).optional()`), so the footgun exists NOW;
   Phase 2b owns normalizing empty→unset and de-duping.
4. **Phase 2's SSR reuse is not free.** `ssr.ts` (`renderThemeCss`) filters keys with
   `/^--inv-[a-z0-9-]+$/` and hardcodes `:root`, so it will *reject* vendor var names like
   `--primary`. SSR no-flash for Tier-A vendor vars needs `ssr.ts` changes — not the
   "Phase 6 reuses ssr unchanged" the earlier text implied. Also `VariableRoleSchema.scope`
   is captured but the entire apply path ignores it (hardcoded `document.documentElement`
   / `:root`).
5. **Schema/data-model divergences from design doc §7 are intentional but real.** The
   map+invariants live in `DesignConfig` (per-app, console-editable), not the manifest
   "declared once"; `variableRoleMap`'s key and `role` are unconstrained `z.string()`
   (no `--` regex, not validated against `ROLE_TOKENS`); `compiledTheme`/`seq` are not
   named schema artifacts (`compiledTheme` = `theme.theme.roles` in `ThemeJsonV2`; `seq`
   lives in the store layer). And the Console's `apps/console/src/api.ts` hand-mirror of
   `DesignConfig` is drifted (missing both Phase-0 fields).

Two smaller gotchas worth carrying: the theme store keys themes by **`userId`**
(query/body), while mods/pointers/bundles key by `subjectId` (path) — `subject = tenant`
means the SDK passes the tenant id as `userId` for the themes endpoints; and **three
independent constraint-derivation paths** exist (`deriveConstraints` via
`mergeInvarianceConfig` at load/reconcile; `designConstraintsFromManifest` in
control-plane authoring; `verification/index.ts`'s `verifyRoleQuality`), so Phase 2b's
"one lock model" goal must touch at least the first two, not only one.

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
- **Files:** Create `packages/cli/src/discover/{vars,classify,coverage,index}.ts` (`vars.ts` static custom-property extraction from CSS text for MVP, runtime `getComputedStyle` reader deferred; `classify.ts` value → role via the existing OKLCH engine; `coverage.ts` the ICP-fit report; `index.ts` the `discoverFromCss` orchestrator). The ONLY existing-code change is adding `export` to the private `kindFromName` in `packages/cli/src/infer-spec.ts:17` — Phase 1 builds a **pure library** (`discoverFromCss`), it does NOT wire a CLI command or modify the `init` flow (persisting the map to `design-config` + the confirm UI are **Phase 4**). Also create a **minimal Tailwind-v4/shadcn sample fixture** (`__fixtures__/shadcn-tokens/globals.css`) — just enough variable-themed surface to discover/classify/apply against. **Phase 5 hardens this same fixture into the full living-test reference app**, so Phases 1–3 have a real, runnable target *before* Phase 5. **Reuse:** `clusterColors` (`packages/design/src/compiler/cluster.ts`) and `inferStyleSpec` (`packages/cli/src/infer-spec.ts:75`).
- **Approach:** classify each discovered variable's *value* with `clusterColors`/role heuristics (the same engine the old scanner used on JSX colors); emit `{ variableRoleMap, styleSpec, coverage }`.
- **Detailed task-level plan:** `docs/superpowers/plans/2026-06-16-phase1-scanner-rework.md`
  (fully task-detailed; the next plan to implement). Code-trace confirmed every
  cross-package assumption holds (`clusterColors` keys `varToRole` by `${kind}:${hex}`;
  `kindFromName` exists private at `infer-spec.ts:17-22`, needs only `export`;
  `inferStyleSpec` reusable verbatim; `discover/` + `__fixtures__/` confirmed absent).
- **Honesty caveat (carried into the detailed plan):** `kindFromName` is a name-keyword
  heuristic; real shadcn vars (`--card`/`--muted`/`--secondary`/`--destructive`) fall
  through to `'bg'`, so role correctness on a *real* shadcn theme is lower than the curated
  fixture suggests. Coverage % stays honest; role correctness needs vendor edits (which the
  design explicitly allows). The fixture is favorably constructed — say so in its comment.
- **Exit:** point at a Tailwind-v4/shadcn sample → a proposed `variableRoleMap` + coverage % that a human would accept with light edits.

### Phase 2 — Applier indirection (role → vendor variable)

- **Goal:** apply a compiled theme by writing the *vendor's* variable names via `variableRoleMap`, not `--inv-*`.
- **Files:** Add `packages/design/src/runtime/apply-mapped.ts`. Iterate the SAME
  `themeToCssEntries(theme)` list (role tokens), and for each `[roleToken, value]` write
  `setProperty(vendorVar, value)` on the configured scope. **Do NOT mutate
  `applyThemeJsonV2`** — it writes `--inv-*` verbatim and is shared by the headless/Trial
  snippet and Nebula; add a parallel mapped path, keep `apply.ts` for the identity case.
  **Reuse:** `compileTheme` output + `themeToCssEntries` + `isSafeCssTokenValue`.
- **Map must be inverted at apply time.** `variableRoleMap` is keyed vendor-var → `{role}`
  (one entry per vendor var); the apply path iterates role tokens. `apply-mapped.ts` owns
  building the inverse `role → [vendorVar...]` index, handling **many-to-one** (two vendor
  vars on one role → both get the value) and **role-with-no-vendor-var** (skip that token).
  Map the bare role name → `--inv-` token (same convention as Phase 2b).
- **Keep the value security boundary.** Every injected value must still pass
  `CssTokenValueSchema` / `isSafeCssTokenValue` (the stored-theme CSS-injection gate) —
  route mapped writes through it exactly as the `--inv-*` path does. Do NOT lift
  `packages/client/overlay.ts`'s permissive arbitrary-token-name handling; Tier A writes
  ONLY vars present in `variableRoleMap`.
- **Scope (MVP decision):** `VariableRoleSchema.scope` is recorded but the as-built apply
  path hardcodes `:root`/`document.documentElement`. MVP honors `:root` only and records
  scope for later; non-`:root` scoped application is deferred (note it, don't silently drop).
- **SSR caveat (do not assume free reuse):** `ssr.ts`'s `renderThemeCss` filters keys with
  `/^--inv-[a-z0-9-]+$/` and hardcodes the `:root{}` wrapper, so it will **reject** vendor
  names like `--primary`. SSR no-flash for mapped vendor vars therefore needs `ssr.ts`
  changes (a vendor-var key regex + scope-aware selector) — that work is **Phase 6**, not a
  freebie here. Phase 2 is client-apply only.
- **Exit:** a compiled theme redefines `--primary` etc. on the Phase 1 sample fixture and repaints with no source edits; missing-map / fetch-failure / role-with-no-vendor-var injects nothing for that token (fail-open); a value failing `isSafeCssTokenValue` is dropped — all asserted.

### Phase 2b — Invariant enforcement wiring (make `locked` + `allowedModes` bind)

> **Code-trace correction (2026-06-16): this is NOT a thin adapter, and the file
> pointer in earlier drafts was wrong.** The enforcement *primitives* are reused
> unchanged, but the *translation into them* is net-new, non-trivial, and lives
> somewhere the plan previously mis-named. Read the four sub-problems below before
> sizing this phase.

- **Why a phase (don't skip):** the compiler + verifier already *consume* `locked_tokens`
  + `allowed_modes`, but only in `--inv-*` role-token space (`compiler/compile.ts:43,57,80`,
  `verify/compiled-tests.ts:86-131`). The new `variableRoleMap[var].locked` /
  `DesignConfig.allowedModes` fields are in vendor-variable / config space and are **not
  yet fed into those constraints** — so today a "locked" brand variable is silently
  unenforced and a disallowed mode passes. Confirmed by reading the source: nothing in the
  verify path or the authoring pipeline reads `DesignConfig.variableRoleMap` or
  `DesignConfig.allowedModes`; `DesignConfig` is only ever read/written by the
  `/design-config` routes.

- **WHERE the bridge actually lives (corrected).** `config/derive-constraints.ts` does
  NOT translate `accentLock`/`chromaCap`/`contrastFloor` — it only reads the
  *already-translated* `config.frontend.design.constraints` block (already `--inv-*`
  keyed). The real vendor-space translation is in **`apps/nebula/src/lib/dev-config.ts →
  mergeInvarianceConfig` (lines 50-63)**: `accentLock → locked_tokens['--inv-accent']`,
  `chromaCap → accent_chroma_max`, `contrastFloor → contrast '>= n'`. That is an **app
  file**, and `DevConfigOverlay` there has no `variableRoleMap`/`allowedModes` fields.
  **There is no package-level `DesignConfig → DesignConstraints` bridge.** Phase 2b
  **creates one** in `packages/design` (e.g. `packages/design/src/config/from-design-config.ts`)
  so it is reusable by the Phase-5 reference app + the Phase-3 SDK, NOT just Nebula.

- **Goal:** a package-level function that takes the vendor `DesignConfig` **and the
  tenant's current compiled role values** and returns the `DesignConstraints` additions
  (`locked_tokens`, `allowed_modes`, `accent_chroma_max`, `contrast`), so a locked vendor
  variable actually pins (verifier re-checks byte-identical) and disallowed modes are
  rejected — with `compile.ts` + `compiled-tests.ts` enforcement **unchanged**.

- **The four sub-problems (each needs a test):**
  1. **Lock value resolution (the hard one).** `locked_tokens[token]` needs a *value*;
     `variableRoleMap[var].locked` is a boolean. For each entry with `locked: true`,
     resolve `'--inv-' + entry.role` and pin **the tenant's current value of that role
     token** (read from the live `ThemeJsonV2.theme.roles`). So the bridge takes
     `currentRoles: Record<RoleToken,string>` as a second argument. If no value is
     available, the lock MUST be omitted (do not emit a key with no value — `verifyV2`
     skips empty `locked_tokens` and the lock silently no-ops). *Confirm intent:* "locked
     = never change from its current value" vs "= a declared brand hex"; the design doc
     frames it as "our brand hue never changes," which the current-value pin satisfies.
  2. **Role-name → token mapping + validation.** `variableRoleMap.role` is a bare string
     (`'accent'`, `'surface-0'`); the compiler/verifier use `'--inv-accent'`. Map by
     prepending `--inv-` AND validate the result is in `ROLE_TOKENS` (reject/warn on a
     typo'd role — an unmatched key is a silent no-op). Note `radius-md` (design doc §7
     example) is NOT a role token; the real ones are `--inv-radius-base` / `--inv-radius-lg`.
  3. **`allowedModes` semantics.** Map `allowedModes → allowed_modes`, and **normalize
     empty→unset** (per §Corrections #3: an empty array currently throws on every
     compile). De-dupe. Convention: *unset/empty = unrestricted*.
  4. **Keep the accent exemption key exact.** `accentChromaWithinCap`
     (`compiled-tests.ts:338`) exempts a locked accent *only* when
     `locked_tokens['--inv-accent']` is present (exact key). A tenant who locks accent via
     `variableRoleMap` MUST still produce that exact key, or a vivid locked accent
     verify-fails → recompiles → reproduces → fails (the unrecoverable loop the source
     comment warns about).

- **Reconcile the legacy lock (one lock model, not three).** Route `accentLock` through
  the same generalized path (accent = a `variableRoleMap` entry `{role:'accent',
  locked:true}` producing `locked_tokens['--inv-accent']`), so there is one lock model.
  Touch BOTH constraint-derivation paths that matter (per §Corrections): the load/reconcile
  path (the new package bridge, consumed where `mergeInvarianceConfig` is today) AND the
  control-plane authoring path (`design-author.ts`'s `designConstraintsFromManifest`,
  which today carries only `contrast` + `accent_chroma_max`) — otherwise locks bind at
  load but not at authoring, and the exit criteria below won't hold.

- **Docs to correct when this lands (maintenance contract):** the "enforcement maps
  directly onto existing machinery" wording in `docs/DESIGN-GOVERNED-CUSTOMIZATION.md`
  §10 and `docs/INVARIANTS-PIPELINE.md` §2 overclaims — both omit the
  vendor-space→`--inv-*` translation gap. Update (don't append) when Phase 2b ships.

- **Exit:** a tenant prompt that would change a `locked: true` variable is
  rejected-or-recompiled with the locked value surviving byte-identical; a disallowed-mode
  prompt is rejected; an empty `allowedModes` is treated as unrestricted (not "all fail") —
  all asserted **through the existing `verifyV2`/`compileTheme`, with no verifier edits**,
  and at BOTH authoring time and load/reconcile time.

### Phase 3 — SDK (drop-in)

- **Goal:** one `<script>` + a React provider: resolve tenant → fetch that tenant's theme (`GET /v1/apps/:appId/themes?userId=<tenant>`) → inject mapped variables (Phase 2) → mount the prompt widget.
- **Distribution caveat (MVP — read before building):** this fetches directly from the
  control plane, which puts Invariance on the tenant's **page-load path** — convenient
  for MVP, but it contradicts the design doc's headline *"no production request transits
  Invariance"* promise (§6/§11) and its CDN pointer→bundle model (§8). Keep the SDK's
  fetch behind a **swappable resolver** so Phase 6's CDN distribution is a transport
  change, not an API change. The as-built design plane reads direct today, so the MVP
  inherits this honestly — but it is a *known gap*, not the target state.
- **Files:** Create `packages/sdk/*` (script-tag bundle + React provider). Tenant resolver pluggable (`data-tenant` / `getTenant()`).
- **What to reuse from where (corrected — don't lift the wrong package):**
  - From `packages/design` (the real apply/SSR/reconcile engine): the **`headless.ts`**
    barrel is the closest existing template — it already exports the exact react-free set an
    SDK needs (`prepareStoredTheme`, `reconcileStoredTheme`, `themeToCssEntries`,
    `ensureFontsLoaded`, `compileTheme`) — plus `storage/api.ts` (`createApiStorage` =
    the per-tenant theme fetch) and the Phase-2 `apply-mapped.ts`. Compose these.
  - From `packages/client` lift only the **shape**, NOT the code: the fail-open `load()`
    skeleton (every failure → base), the `vanilla.ts` `document.currentScript.dataset`
    bootstrap (keep its `script instanceof HTMLScriptElement` guard; must not run under
    SSR), the core/React provider-subpath split, and `telemetry.ts` (reusable as-is).
    **Do NOT reuse `client/overlay.ts`** (it applies arbitrary token names from a mod
    bundle — wrong model) and **do NOT reuse the pointer/`bundles/:hash`/`signing-key`
    two-step** (that's Tier-C bundle distribution; Tier-A's CDN model is Phase 6).
- **Replicate the `cache:'no-store'` lesson.** When the SDK fetches the tenant theme from
  the control plane inside a Next host, it MUST set `cache:'no-store'` on that GET — the
  single hardest-won detail from `packages/server/src/runtime.ts` (a Next Data Cache served
  a stale signing key and silently no-op'd everything). Same failure mode applies to a
  cached stale theme/pointer.
- **Naming collision:** there are already two `InvarianceProvider`/`useInvariance` symbols
  (`@invariance/design` and `@invariance/client/react`). This new SDK provider is a third —
  give it a distinct name (or re-export the design one) to avoid three same-named symbols.
- **Subject keying:** pass the tenant id as **`userId`** to the themes endpoints
  (`GET/PUT /v1/apps/:appId/themes?userId=<tenant>`) — themes key by `userId`, not the
  `subjectId` used by Tier-C pointer/bundle calls (see §Corrections).
- **Exit:** drop the snippet into the Phase 1 sample fixture → per-tenant theme applies; control-plane down → base app (fail-open) — asserted.

### Phase 4 — Governance dashboard (Console reframe)

- **Goal:** Connect/scan + coverage report, `variableRoleMap` confirm/edit, invariant editor (locked vars, contrast floor, allowed modes, chroma cap), per-tenant theme browser, kill-switch.
- **Files:** New `apps/console` views; **reuse** `GET/PUT /v1/apps/:appId/design-config` +
  the themes endpoints + `summarizeStyleSpec`. Extend the existing Invariants/Themes views
  rather than replace. Mostly additive — the only genuinely-new screen is connect/scan +
  coverage.
- **Fix the drifted config type by importing, not re-mirroring.** `apps/console/src/api.ts`
  hand-maintains a `DesignConfig` interface missing `variableRoleMap`/`allowedModes` (Phase
  0 drift). The console already depends on `@invariance/schema` (browser-safe barrel) — so
  **import the canonical `DesignConfig`/`VariableRoleMap` types from there** and delete the
  local mirror, eliminating future drift (not just patching this one gap). Confirm the
  schema barrel stays node-free (it omits `./signing` by design).
- **`LockControls` is a migration, not a relabel.** It edits `{accentLock (one hex),
  lockedSections (m.slot names), chromaCap, contrastFloor, pageLevels}`. Tier A's model is
  a **per-variable lock table** driven by `variableRoleMap[var].locked` + an `allowedModes`
  (light/dark) toggle. `lockedSections`/`pageLevels` are Tier-B/layout and out of Tier-A
  scope. Build the variable-level lock editor; keep contrast floor + chroma cap controls.
- **Decide the Tier-C surface fate.** Guardrails (`guardrails.ts`, `GuardrailsView`),
  Dashboard, `SubjectView`, and the whole mods model (`api.mods/overview/kill/restore/
  postBundle`) are Tier-C (signed bundles / hooks / sandbox) and **not load-bearing for the
  Tier-A dashboard**. For the MVP, hide them behind a Tier-C flag rather than delete
  (parked, not removed). The "tenant theme browser" maps to the existing **Themes view**
  (subject=tenant relabel), NOT the mods Dashboard.
- **Resolve the scanner→design-config data path (currently a gap).** Phase 1 produces
  `discoverFromCss` as a pure library object; there is **no defined path** to get its
  proposed `variableRoleMap`+coverage INTO the `design-config` the Console edits. Phase 4
  must pick one: (a) the Console triggers a scan (runtime discovery in the connect snippet),
  or (b) it imports CLI scanner output. Decide + build this — the connect/scan screen
  depends on it.
- **Exit:** a vendor onboards (connect → coverage → confirm map → set invariants) + governs end-to-end in the UI; edits persist to `design-config` via the canonical typed payload (no field silently dropped).

### Phase 5 — Reference app (living integration test)

- **Goal:** a Tailwind-v4 / shadcn sample app, variable-themed, as the e2e test (the Nebula analog) scoped to the ICP.
- **Files:** Create `apps/reference/*`; wire only the SDK snippet (no `m.slot`, no route wrapping).
- **Use genuinely vendor-native var names (critical — don't make discovery circular).**
  The app's `:root` must declare shadcn-style names (`--background`, `--foreground`,
  `--primary`, `--card`, `--border`, `--ring`, `--radius`), NOT Invariance's `--inv-*`
  layer. Seeding `--inv-*` (copying Nebula's `globals.css`) would make Phase 1 discovery
  trivially circular and fail to prove the non-invasive value prop. The whole point is to
  discover/classify/redefine the app's OWN names.
- **Start clean; don't inherit Nebula's Tier-C wiring.** Do NOT copy Nebula's
  `next.config.js` (its `quickjs-emscripten` externalize block is Tier-C sandbox config the
  reference app has no use for) or add a `@invariance/server` dep. Reuse only the SSR
  no-flash head-injection pattern from `apps/nebula/src/app/layout.tsx`. Mimic Streamline's
  two-user switcher (`apps/demo/src/App.tsx`) to demo per-tenant theme isolation.
  (Note: `apps/demo`/Streamline is a Tier-C `@invariance/client` app, NOT a design-plane
  analog — the real "Nebula analog" is Nebula.)
- **Exit:** `"match our brand: navy + gold"` prompt → governed, accessible, per-tenant theme end-to-end; the contrast floor + locked brand var hold.

### Phase 6 — Hardening

- **Goal:** **per-tenant CDN distribution** (short-TTL pointer → immutable CDN-cached theme JSON) so the apply path stops transiting the control plane and delivers the §6/§8/§11 *"no production request transits Invariance"* promise — this closes the Phase 3 MVP gap; SSR no-flash (`<head>` injection / cookie mirror); lazy revalidation on invariant change (reuse the existing reconcile path); kill-switch; analytics of what tenants change.
- **What's already built (reuse, don't rebuild):** `reconcileStoredTheme`
  (`runtime/reconcile-theme.ts`) already does recompile-keep-vibe-or-drop on invariant
  change — the lazy-revalidation requirement is done; just wire the SDK/reference app to
  it. `mirrorThemeCookie` + `themeFromCookieHeader` + `renderThemeCss` give the cookie/SSR
  scaffolding.
- **SSR no-flash needs `ssr.ts` changes for Tier-A (the Phase-2 caveat lands here).**
  `renderThemeCss` filters `/^--inv-[a-z0-9-]+$/` and hardcodes `:root{}` → it rejects
  vendor names. Add a vendor-var key path + scope-aware selector so SSR emits the mapped
  vendor vars. Also: `cookie-mirror.ts` skips above `MAX_COOKIE_BYTES=3800`; a full theme
  (38 roles + slots + styleSpec) can exceed it → mirror only the compiled token block (not
  styleSpec), or move to a server-side store keyed by a tenant cookie id.
- **Signing-key durability is a prerequisite for content-addressed distribution.**
  `keys.ts` generates a per-process keypair unless `INVARIANCE_SIGNING_*` is set; a restart
  invalidates everything previously signed. Persist the key before any durable Tier-A CDN
  distribution (already flagged in CLAUDE.md / MEMORY.md).
- **Exit:** the apply fetch hits a CDN pointer/bundle, not the control plane (control-plane outage no longer touches the apply path); flash-free first paint (vendor vars, not `--inv-*`); tightening an invariant recompiles-or-drops tenant themes on next load; kill-switch reverts a tenant to base within the pointer TTL.

---

## Self-review (writing-plans checklist)

- **Spec coverage:** Phases 0, 1, 2, **2b**, 3–6 cover every Tier-A element of `DESIGN-GOVERNED-CUSTOMIZATION.md` §13 (schema, scanner, applier, **invariant enforcement wiring**, SDK, dashboard, reference app, hardening incl. **CDN distribution**). §10's enforcement guarantees (locked vars, allowed modes) bind via Phase 2b — not by assuming the verifier already sees the new fields; the §6/§11 *no-prod-transit* promise lands in Phase 6, with Phase 3 flagging the interim direct-fetch gap. Tier B/C are explicitly deferred there and here.
- **Placeholders:** Phase 0 tasks carry real test + impl code and exact commands. Phases 1–6 are *scoped sub-plans* (goal/files/approach/exit), not placeholder tasks — they get task-level detail when started, per the scope check.
- **Type consistency:** `VariableRoleSchema` / `VariableRoleMapSchema` / `DesignConfig.variableRoleMap` are used consistently across Phase 0 (schema) and referenced identically in Phases 1–4.
- **Code-trace corrections (2026-06-16):** the five findings + two gotchas from the
  substrate code trace are captured once in **§Corrections** and folded into the phases
  they affect — Phase 2b (bridge location + lock-value + role↔token mapping + empty-modes +
  accent-key + three constraint paths), Phase 2 (map inversion + value-safety + SSR/scope
  caveat), Phase 3 (design-vs-client reuse + `no-store` + naming collision + `userId`
  keying), Phase 4 (`api.ts` import-not-mirror + LockControls migration + Tier-C surface
  fate + scanner→design-config data path), Phase 5 (vendor-native var names), Phase 6
  (`ssr.ts` vendor-var path + cookie size + key durability). The "reuse the verifier
  unchanged" framing is now qualified: enforcement *primitives* are reused unchanged; the
  *translation into them* (Phase 2b) is net-new.
