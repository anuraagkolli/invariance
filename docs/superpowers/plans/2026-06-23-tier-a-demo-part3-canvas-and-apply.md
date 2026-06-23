# Tier-A Demo — Part 3: Canvas + Scoped Apply (chromium-verified) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the demo *render and re-theme in a real browser* — an enterprise-shaped `AnalyticsDashboard` themed purely through `hsl(var(--x))`, re-coloured by a scoped in-page applier (`applyScoped`), proven in chromium to reflect the theme and to swap correctly on a light↔dark toggle — on the now-locked governance proof from Part 2.

**Architecture:** First resolve the cross-app wiring once (Task 0): extract the pure authoring seams into `@invariance/theming` so the demo imports a normal workspace package and Vite can bundle cleanly. Then add Vite + React + Tailwind v4 to `apps/tier-a-demo` (Task 1), build the dashboard canvas (Task 2, pure-var, zero `dark:` utilities), the scoped applier (Task 3, the demo's honest stand-in for the production `:root`/`.dark` applier), and one chromium visual-truth test (Task 4).

**Tech Stack:** TypeScript, React 18, Vite, Tailwind v4, vitest (node for logic, **chromium via Playwright for visual truth**), `@invariance/theming`.

## Global Constraints

- **Testing is light here (spec §7):** ONE chromium visual-truth test (CTA reflects the theme; dark toggle swaps colors) + mount-without-throwing smoke + the existing logic tests. Do NOT re-prove the engine — Parts 1–2 locked it.
- **The canvas themes 100% through `hsl(var(--x))` — ZERO `dark:` Tailwind utilities** (a `dark:` utility is a second source of truth that diverges from pure-var theming). Enforced by a source guard (Task 2).
- **`applyScoped` must render identically to the production applier** — same values, different scope (wrapper vs `:root`). The light/dark toggle sets **both** the var map **and** `class="dark"` on the wrapper (a scoped wrapper does not inherit a `:root`-level `.dark`).
- **Branch:** continue on `tier-a-demo`.
- **Task 0 evolves `@invariance/theming` (a behavior-preserving move, re-verified).** After it, ALL suites must be green: `@invariance/theming` (273), `@invariance/control-plane` (245), `@invariance/verify-engine` (117), `@invariance/tier-a-demo`. No logic changes — cut/paste + re-export only.
- Engine facts: `runTurn`/`acknowledge`/`APP_DEFAULT_SPEC`/`Session`/`TurnResult` live in `apps/control-plane/src/theming/authoring/session.ts`; `Agent`/`GateClassification`/`Gatekeeper*`/`Designer*`/`ConstraintEnvelope`/`buildEnvelope` in `.../authoring/agent-types.ts`; `resetToPublished`/`resetToAppDefault` also in `session.ts` (they depend on `AuditStore`, a control-plane storage interface — they STAY). `CandidateTheme = { light: Record<VarName,string>; dark?: Record<VarName,string>; meta }`. `SHADCN_CAN` colours emit bare HSL triples consumed as `hsl(var(--x))`.

---

### Task 0: Resolve the wiring — extract the pure authoring seams into `@invariance/theming`

> **The decision (front-loaded):** the demo will be a Vite bundle, so it must import the session machine + agent contract through a real workspace package, not a `../../../control-plane/...` relative path (awkward to bundle across `apps/` boundaries). We **extract over copy** — a copied reducer is the one place the demo silently diverges from the product. The pure turn-machine + agent contract are plane-agnostic and belong beside `mergeDelta`/`diffSpecs` in `@invariance/theming`; `resetToPublished` (needs `AuditStore`) stays in control-plane. This is a behavior-preserving move: cut → paste → re-export → all suites green.

**Files:**
- Create: `packages/theming/src/session/turn.ts`, `packages/theming/src/authoring/index.ts`
- Modify: `packages/theming/src/session/index.ts`, `packages/theming/src/index.ts`, `packages/theming/package.json` (exports)
- Modify: `apps/control-plane/src/theming/authoring/session.ts`, `apps/control-plane/src/theming/authoring/agent-types.ts` (become re-exports)
- Modify: `apps/tier-a-demo/src/demo/wiring.ts` (import from the package)

**Interfaces:**
- Produces: `@invariance/theming/session` now also exports `runTurn`, `acknowledge`, `APP_DEFAULT_SPEC`, `Session`, `TurnResult`; new `@invariance/theming/authoring` exports `Agent`, `GateClassification`, `GatekeeperInput/Result`, `DesignerInput/Result`, `ConstraintEnvelope`, `buildEnvelope`. Both also surface on the root barrel. Control-plane and the demo import these from the package.

- [ ] **Step 1: Move the turn-machine into the package (cut from control-plane session.ts)**

Create `packages/theming/src/session/turn.ts` with the EXACT current bodies of `APP_DEFAULT_SPEC`, `Session`, `TurnResult`, `runTurn`, `acknowledge` from `apps/control-plane/src/theming/authoring/session.ts` — but change the imports to intra-package (`from "../spec/index.js"`, `"./merge.js"`, `"./diff.js"`, `"../compile/index.js"`, `"../verify/index.js"`). Do NOT move `resetToPublished`/`resetToAppDefault` (they import `AuditStore`).
```typescript
// packages/theming/src/session/turn.ts
import { canonicalize, mergeDelta } from "./merge.js";
import { diffSpecs } from "./diff.js";
import { parseSpec } from "../spec/index.js";
import { compile } from "../compile/index.js";
import { verify } from "../verify/index.js";
import type { StyleSpec } from "../spec/index.js";
import type { AppManifest } from "../manifest/index.js";
import type { CandidateTheme } from "../compile/index.js";
import type { FieldDiff } from "./diff.js";
import type { WallFailure } from "../spec/index.js";
import type { VerifyFailure } from "../verify/index.js";

export const APP_DEFAULT_SPEC: StyleSpec = canonicalize({});

export type Session = {
  tenant: string;
  draft: StyleSpec;
  candidate?: CandidateTheme;
  pendingSpec?: StyleSpec;
  published: string | null;
};
export type TurnResult =
  | { kind: "diff"; diff: FieldDiff[]; candidate: CandidateTheme; pendingSpec: StyleSpec }
  | { kind: "no_change" }
  | { kind: "rejected"; failures: (WallFailure | VerifyFailure)[] };

export function runTurn(session: Session, delta: unknown, manifest: AppManifest): TurnResult {
  const parsed = parseSpec(delta, manifest);
  if (!parsed.ok) return { kind: "rejected", failures: parsed.failures };
  const pendingSpec = mergeDelta(session.draft, parsed.spec);
  const diff = diffSpecs(session.draft, pendingSpec, manifest);
  if (diff.length === 0) return { kind: "no_change" };
  const candidate = compile(pendingSpec, manifest);
  const verdict = verify(candidate, manifest);
  if (!verdict.ok) return { kind: "rejected", failures: verdict.failures };
  return { kind: "diff", diff, candidate, pendingSpec };
}

export function acknowledge(session: Session): Session {
  if (session.pendingSpec === undefined) throw new Error("acknowledge: no pending candidate to commit");
  return { tenant: session.tenant, draft: session.pendingSpec, candidate: undefined, pendingSpec: undefined, published: session.published };
}
```
Verify these bodies match the originals exactly (copy the real source; the above mirrors it).

- [ ] **Step 2: Move the authoring contract into the package**

Create `packages/theming/src/authoring/index.ts` with the EXACT current contents of `agent-types.ts` (`Agent`, `GateClassification`, `GatekeeperInput/Result`, `DesignerInput/Result`, `ConstraintEnvelope`, `buildEnvelope`), changing the `FontStackId`/`StyleSpec`/etc. import to intra-package (`from "../spec/index.js"`, `"../roles/index.js"`, `"../manifest/index.js"`).

- [ ] **Step 3: Wire the package barrels + exports**

In `packages/theming/src/session/index.ts` add `export * from "./turn.js";`. In `packages/theming/src/index.ts` add `export * from "./authoring/index.js";`. In `packages/theming/package.json` `exports`, add `"./authoring": "./src/authoring/index.ts"`.

- [ ] **Step 4: Turn control-plane's modules into re-exports (keep `resetToPublished`)**

In `apps/control-plane/src/theming/authoring/session.ts`: delete the moved bodies; `export { runTurn, acknowledge, APP_DEFAULT_SPEC } from "@invariance/theming";` `export type { Session, TurnResult } from "@invariance/theming";` and KEEP `resetToPublished`/`resetToAppDefault` (now importing `APP_DEFAULT_SPEC`/`canonicalize` from `@invariance/theming` and `AuditStore` locally). In `agent-types.ts`: replace its contents with `export * from "@invariance/theming/authoring";`.

- [ ] **Step 5: Point the demo wiring at the package**

Rewrite `apps/tier-a-demo/src/demo/wiring.ts`:
```typescript
export { runTurn, acknowledge, APP_DEFAULT_SPEC, buildEnvelope } from "@invariance/theming";
export type {
  Session, TurnResult, Agent, GateClassification,
  GatekeeperInput, GatekeeperResult, DesignerInput, DesignerResult,
} from "@invariance/theming";
```

- [ ] **Step 6: Re-verify EVERYTHING (the move is correct iff all suites stay green)**

Run, expecting all green:
```bash
pnpm -F @invariance/theming test        # 273
pnpm -F @invariance/control-plane test   # 245
pnpm -F @invariance/verify-engine test   # 117
pnpm -F @invariance/tier-a-demo test     # 17
pnpm -F @invariance/theming typecheck && pnpm -F @invariance/control-plane typecheck && pnpm -F @invariance/tier-a-demo typecheck
```
If any fail: the move wasn't behavior-preserving — fix the re-export/import, do not change logic. Commit only when all green.

- [ ] **Step 7: Commit**

```bash
git add packages/theming apps/control-plane/src/theming/authoring apps/tier-a-demo/src/demo/wiring.ts
git commit -m "refactor(theming): extract pure session turn-machine + agent contract into @invariance/theming; control-plane re-exports"
```

---

### Task 1: Add Vite + React + Tailwind to `apps/tier-a-demo` + mount smoke

**Files:**
- Modify: `apps/tier-a-demo/package.json` (deps + scripts)
- Create: `apps/tier-a-demo/index.html`, `apps/tier-a-demo/vite.config.ts`, `apps/tier-a-demo/src/main.tsx`, `apps/tier-a-demo/src/App.tsx`, `apps/tier-a-demo/src/index.css`
- Test: `apps/tier-a-demo/test/mount.test.tsx`

**Interfaces:**
- Produces: a runnable Vite app (`pnpm -F @invariance/tier-a-demo dev` / `build`) rendering a placeholder `App`, and a happy-dom mount smoke test.

- [ ] **Step 1: Add deps + scripts**

Merge into `apps/tier-a-demo/package.json`:
```json
{
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview", "test": "vitest run", "typecheck": "tsc --noEmit" },
  "dependencies": { "@invariance/theming": "workspace:*", "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": {
    "@types/node": "^22.0.0", "@types/react": "^18.3.0", "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0", "vite": "^5.4.0", "tailwindcss": "^4.0.0", "@tailwindcss/vite": "^4.0.0",
    "happy-dom": "^16.0.0", "playwright": "^1.60.0", "tsx": "^4.19.0", "typescript": "^5.6.0", "vitest": "^3.0.0"
  }
}
```
Run `pnpm install`.

- [ ] **Step 2: Vite + Tailwind config + entry**

`apps/tier-a-demo/vite.config.ts`:
```typescript
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
export default defineConfig({ plugins: [react(), tailwindcss()] });
```
`apps/tier-a-demo/src/index.css`: `@import "tailwindcss";`
`apps/tier-a-demo/index.html`: a standard Vite root (`<div id="root">` + `<script type="module" src="/src/main.tsx">`).
`apps/tier-a-demo/src/main.tsx`: `createRoot(document.getElementById("root")!).render(<App />)` (import `./index.css`).
`apps/tier-a-demo/src/App.tsx`: `export function App() { return <div data-testid="app">tier-a-demo</div>; }`

- [ ] **Step 3: Update vitest config to run both node + happy-dom tests**

`apps/tier-a-demo/vitest.config.ts` — keep `environment: "node"` as default; the mount test opts into happy-dom with a top-of-file `// @vitest-environment happy-dom` pragma. Confirm `include` covers `test/**/*.test.ts` AND `test/**/*.test.tsx`.

- [ ] **Step 4: Mount smoke test (happy-dom) — write, run (PASS)**

`apps/tier-a-demo/test/mount.test.tsx`:
```tsx
// @vitest-environment happy-dom
import { render } from "@testing-library/react"; // if not desired, use ReactDOM + a container
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";

describe("mount", () => {
  it("renders the app shell without throwing", () => {
    const { getByTestId } = render(<App />);
    expect(getByTestId("app")).toBeTruthy();
  });
});
```
(If not adding `@testing-library/react`, mount via `ReactDOM.createRoot(container).render(<App/>)` and assert `container.textContent`. Pick one and add the dep if used.)
Run: `pnpm -F @invariance/tier-a-demo test mount` → PASS. Also `pnpm -F @invariance/tier-a-demo build` → succeeds (proves Vite bundles the package imports from Task 0).

- [ ] **Step 5: Commit**

```bash
git add apps/tier-a-demo/package.json apps/tier-a-demo/vite.config.ts apps/tier-a-demo/vitest.config.ts apps/tier-a-demo/index.html apps/tier-a-demo/src/main.tsx apps/tier-a-demo/src/App.tsx apps/tier-a-demo/src/index.css apps/tier-a-demo/test/mount.test.tsx pnpm-lock.yaml
git commit -m "feat(tier-a-demo): Vite + React + Tailwind scaffold + mount smoke (Vite bundles the package wiring)"
```

---

### Task 2: The `AnalyticsDashboard` canvas (pure-var) + no-`dark:` guard

**Files:**
- Create: `apps/tier-a-demo/src/canvas/AnalyticsDashboard.tsx`
- Test: `apps/tier-a-demo/test/canvas-purevar.test.ts`

**Interfaces:**
- Produces: `export function AnalyticsDashboard()` — a prop-less, presentational, enterprise-shaped dashboard themed **only** via `hsl(var(--x))`, with a CTA at `data-testid="cta"` (background `hsl(var(--primary))`) the chromium test targets.

- [ ] **Step 1: Build the dashboard (themed purely through vars)**

`apps/tier-a-demo/src/canvas/AnalyticsDashboard.tsx`: a sidebar, a top bar, 3 KPI stat cards, one CSS-bar chart, a small data table, filter chips, primary + secondary CTAs, a destructive action, and muted helper text — each coloured with `style={{ background: "hsl(var(--card))", color: "hsl(var(--card-foreground))" }}` / `hsl(var(--primary))` etc. **No `dark:` Tailwind utilities anywhere.** The primary CTA: `<button data-testid="cta" style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>`. Use the shadcn var names the manifest maps (`--background`, `--foreground`, `--card`, `--card-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--accent`, `--muted`, `--muted-foreground`, `--destructive`, `--border`). (Concrete JSX is straightforward; keep it to ~120 lines of presentational markup.)

- [ ] **Step 2: The no-`dark:` source guard — write, run (PASS)**

`apps/tier-a-demo/test/canvas-purevar.test.ts`:
```typescript
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("canvas is pure-var (no dark: utilities → one source of truth)", () => {
  it("AnalyticsDashboard.tsx contains no `dark:` Tailwind utility", () => {
    const src = readFileSync(fileURLToPath(new URL("../src/canvas/AnalyticsDashboard.tsx", import.meta.url)), "utf8");
    expect(/(^|[\s"'`])dark:/.test(src), "found a dark: utility — themes only via hsl(var(--x))").toBe(false);
  });
});
```
Run: `pnpm -F @invariance/tier-a-demo test canvas-purevar` → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/tier-a-demo/src/canvas/AnalyticsDashboard.tsx apps/tier-a-demo/test/canvas-purevar.test.ts
git commit -m "feat(tier-a-demo): AnalyticsDashboard canvas (pure-var) + no-dark: source guard"
```

---

### Task 3: `applyScoped` + the rendered demo page

**Files:**
- Create: `apps/tier-a-demo/src/preview/apply-scoped.ts`
- Modify: `apps/tier-a-demo/src/App.tsx` (render the dashboard in a scoped wrapper with a theme applied + a light/dark toggle)
- Test: `apps/tier-a-demo/test/apply-scoped.test.ts` (logic, node)

**Interfaces:**
- Produces: `export function applyScoped(wrapper: HTMLElement, theme: CandidateTheme, mode: "light" | "dark"): void` — sets the mode's var map as inline custom properties on `wrapper` and toggles `class="dark"`. The App renders `<div ref=wrapper>` containing `<AnalyticsDashboard/>`, applies a sample compiled theme, and a button toggles mode.

- [ ] **Step 1: Write `applyScoped` + a logic test (node)**

`apps/tier-a-demo/src/preview/apply-scoped.ts`:
```typescript
import type { CandidateTheme } from "@invariance/theming";

// The demo's stand-in for the production :root/.dark applier. Same VALUES, scoped to a wrapper element.
// Sets every emitted var as an inline custom property, AND toggles class="dark" — a scoped wrapper does
// not inherit a :root-level .dark toggle, so the class must travel with the var map.
export function applyScoped(wrapper: HTMLElement, theme: CandidateTheme, mode: "light" | "dark"): void {
  const vars = mode === "dark" ? (theme.dark ?? theme.light) : theme.light;
  for (const [name, value] of Object.entries(vars)) wrapper.style.setProperty(name, value);
  wrapper.classList.toggle("dark", mode === "dark");
}
```
`apps/tier-a-demo/test/apply-scoped.test.ts` (node + happy-dom pragma): assert that after `applyScoped(el, theme, "light")`, `el.style.getPropertyValue("--primary")` equals `theme.light["--primary"]`; after `"dark"`, it equals `theme.dark!["--primary"]` and `el.classList.contains("dark")` is true. Run → PASS. (This is logic, not cascade truth — that's Task 4 in chromium.)

- [ ] **Step 2: Render the dashboard in a scoped wrapper in `App.tsx`**

`App.tsx`: compile a sample theme once (`compile(parseSpec({colors:{primary:"oklch(0.35 0.12 270)"}}, DEMO_MANIFEST).spec, DEMO_MANIFEST)`), render `<div ref={wrapperRef} data-testid="scope" style={{ background: "hsl(var(--background))" }}><AnalyticsDashboard/></div>`, call `applyScoped(wrapperRef.current!, theme, mode)` in an effect on `mode`, and a `<button data-testid="toggle-dark">` flipping `mode`. Run `pnpm -F @invariance/tier-a-demo build` → succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/tier-a-demo/src/preview/apply-scoped.ts apps/tier-a-demo/src/App.tsx apps/tier-a-demo/test/apply-scoped.test.ts
git commit -m "feat(tier-a-demo): applyScoped (scoped in-page applier) + dashboard rendered in a themed wrapper"
```

---

### Task 4: The chromium visual-truth test (cascade + dark swap)

**Files:**
- Test: `apps/tier-a-demo/test/cascade.chromium.test.ts`

**Interfaces:**
- Consumes: the built/served App (or `page.setContent` with the rendered markup), `applyScoped`, `DEMO_MANIFEST`, `compile`/`parseSpec`, `contrast`/`parseToSrgb`-style measure (reuse `test/_measure.ts`).
- Produces: the proof that scoped apply re-themes a REAL browser correctly in both modes.

- [ ] **Step 1: Write the chromium test (the two truths)**

`apps/tier-a-demo/test/cascade.chromium.test.ts` (vitest, `environment: "node"`; launches chromium via `playwright`): build a tiny same-origin page that imports the canvas + `applyScoped` (simplest: `vite build` then `playwright` serves `dist/`, OR `page.setContent` with a static gallery snippet using `hsl(var(--x))` mirroring the CTA). Steps in the test:
  1. compile a theme from `{colors:{primary:"oklch(0.35 0.12 270)"}}` via `DEMO_MANIFEST`.
  2. apply it scoped in light; `getComputedStyle(cta).backgroundColor` → equals the **independently computed** RGB of `theme.light["--primary"]` (via `_measure` `parseToSrgb`×255), within ±2; and **differs from the base** primary.
  3. apply in dark (var map + `.dark` on the wrapper); `getComputedStyle(cta).backgroundColor` → equals `theme.dark!["--primary"]`'s RGB, and **differs from the light value** (the toggle genuinely swapped).
Model the launch + `getComputedStyle` + `parseCssRgb` helpers on the verification suite's `tests/verify/E-cascade.test.ts` (chromium 1223 is installed).

- [ ] **Step 2: Run + full suite + commit**

Run: `pnpm -F @invariance/tier-a-demo test` → all green (smoke + probe + manifest + wiring + canned-agent + beats + mount + canvas-purevar + apply-scoped + cascade.chromium).
```bash
git add apps/tier-a-demo/test/cascade.chromium.test.ts
git commit -m "test(tier-a-demo): chromium visual-truth — scoped apply themes the CTA in light, dark toggle swaps colors"
```

---

## Self-Review

**1. Spec coverage (§8 Part 2 "Canvas + applyScoped, chromium-verified"):** Task 0 resolves the wiring as the prerequisite; Task 1 = Vite/React/Tailwind + mount; Task 2 = the `AnalyticsDashboard` (pure-var) + the no-`dark:` guard (§3.2 / Global Constraints); Task 3 = `applyScoped` (var map + `.dark` class, §3.2); Task 4 = the chromium cascade + dark-swap truth (§7). Customizer/OutcomePanel/session-UI = Part 4; side-by-side/climax = Part 5.

**2. Placeholder scan:** the dashboard JSX (Task 2 Step 1) is described structurally with the exact var names + the testid'd CTA rather than 120 lines transcribed — acceptable for presentational markup, and the load-bearing contracts (`applyScoped`, the chromium assertions, the wiring extract, configs) are fully concrete. The Task-4 page-serving choice (vite-build+serve vs `setContent`) is an explicit either/or with the verification-suite precedent named, not a vague "set up a browser."

**3. Type consistency:** `applyScoped(wrapper, theme: CandidateTheme, mode)` is used identically in Task 3's test and Task 4. `CandidateTheme.dark?` optionality is handled (`theme.dark ?? theme.light`). After Task 0, `runTurn`/`acknowledge`/`buildEnvelope`/`Agent`/`Session`/`TurnResult` all resolve from `@invariance/theming` in both control-plane and the demo; the Part-2 tests that import them via `wiring.ts` keep working because `wiring.ts` is repointed (Task 0 Step 5).

**Note (Task 0 risk):** this is the one task that touches the verified engine + control-plane. It is a behavior-preserving cut/paste + re-export; Step 6 re-runs all four suites + typechecks as the gate. If a suite goes red, the move diverged — fix the wiring, never the logic.
