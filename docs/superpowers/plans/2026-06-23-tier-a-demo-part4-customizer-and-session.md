# Tier-A Demo — Part 4: Customizer UI + Page-Held Session — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the live customize loop — a prompt (typed or a scripted example) drives the `CannedAgent` → the real engine turn → the three outcomes surface in an `OutcomePanel` (rejection first-class, **copy rendered by the engine's `failureTemplate`**) → an accepted diff re-themes the live preview → acknowledge/publish/reset over a page-held session.

**Architecture:** All client-side. `failureTemplate` is extracted into `@invariance/theming/authoring` (so the rejection panel renders the *engine's* governance copy, not a UI-local fork — same reason every verdict in this project comes from the engine). A reusable `runScriptedTurn` (gatekeep → design → `runTurn`); a thin per-tenant `useDemoSession` hook holding the `Session` + applied candidate in page state; presentational `PromptBox`/`OutcomePanel`/`SessionControls`; the App becomes a studio (customizer beside the Part-3 dashboard preview). Engine imported from crypto-free subpaths.

**Tech Stack:** React 18, Vite, Tailwind v3 (layout-only), vitest (node + happy-dom; chromium for the e2e), `@invariance/theming`.

## Global Constraints

- **The rejection panel renders `failureTemplate(failure)` — the engine's deterministic copy** (`{ headline, detail, suggestion? }`), NOT a UI-local code→headline map and NOT the raw `failure.message`. The panel is the governance surface; its copy is the engine's. Local styling (the dramatic border, the "your design is unchanged" line) is demo presentation — fine to author.
- **No gate-reject sentinel.** All four scripted beats are `in_scope_styling`; `runScriptedTurn` throws on a non-in-scope classification, and an unscripted typed prompt makes `CannedAgent` throw — both caught by the hook into a `notice` string (NOT a fake `{kind:"rejected", failures:[]}`). `rejected` always carries real wall/verifier failures.
- **Applied advances only on `diff`.** A `rejected`/`no_change` turn never disturbs the preview — including after a publish (the on-camera case: a rejection must not visibly touch a customized, published look).
- **`publish()` is page-held** — it flips a boolean and marks the applied look "live". (The real product flips the KV pointer: artifact→pointer→audit. Named as such in code.)
- **`reset()` → app default** (start over). Deliberate: the engine also has `resetToPublished` (kept in control-plane in Part 3); the demo's Reset is app-default. Part 5's two-tenant flow may add reset-to-this-tenant's-published — decided then, not retrofitted.
- **Per-tenant from the start:** `useDemoSession(agent, manifest, tenant)` is tenant-scoped; the studio uses one instance (`"acme"`). Part 5 renders one instance per tenant (no Map refactor needed).
- **Browser code imports the engine from crypto-free subpaths** (`/session`, `/authoring`, `/compile`, `/manifest`, `/spec`) — never the barrel. Task 1 makes `wiring.ts` the single browser-safe wiring module.
- **Branch:** `tier-a-demo`. Testing light per §7. **Task 1 touches the engine + control-plane (the `failureTemplate` move) — re-verify all four suites (273/245/117/demo) + typechecks.**

---

### Task 1: Extract `failureTemplate` into the package + browser-safe wiring

**Files:**
- Create: `packages/theming/src/authoring/failure-ux.ts`
- Modify: `packages/theming/src/authoring/index.ts` (re-export it)
- Modify: `apps/control-plane/src/theming/authoring/failure-ux.ts` (becomes a re-export)
- Modify: `apps/tier-a-demo/src/demo/wiring.ts` (crypto-free subpaths + `failureTemplate`)

**Interfaces:**
- Produces: `@invariance/theming/authoring` now also exports `failureTemplate(failure: WallFailure | VerifyFailure): FailureMessage` and `FailureMessage = { code; headline; detail; suggestion? }`.

- [ ] **Step 1: Move `failure-ux.ts` into the package (intra-package type imports)**

Create `packages/theming/src/authoring/failure-ux.ts` with the EXACT current bodies from
`apps/control-plane/src/theming/authoring/failure-ux.ts` (the `FailureMessage` type, `isVerifyFailure`,
`wallTemplate`, `verifyTemplate`, `failureTemplate`), changing only the imports to intra-package:
```typescript
import type { WallFailure, WallFailureCode } from "../spec/index.js";
import type { VerifyFailure, VerifyFailureCode } from "../verify/index.js";
// …rest identical to the control-plane original…
```

- [ ] **Step 2: Re-export from the authoring barrel; control-plane re-exports**

In `packages/theming/src/authoring/index.ts` add `export * from "./failure-ux.js";`.
Replace `apps/control-plane/src/theming/authoring/failure-ux.ts` contents with:
`export * from "@invariance/theming/authoring";` (so existing control-plane imports of `failureTemplate`/`FailureMessage` are unchanged).

- [ ] **Step 3: Repoint `wiring.ts` to crypto-free subpaths + add `failureTemplate`**

```typescript
// apps/tier-a-demo/src/demo/wiring.ts — subpaths only (the barrel pulls node:crypto via artifact)
export { runTurn, acknowledge, APP_DEFAULT_SPEC } from "@invariance/theming/session";
export type { Session, TurnResult } from "@invariance/theming/session";
export { buildEnvelope, failureTemplate } from "@invariance/theming/authoring";
export type {
  Agent, GateClassification, GatekeeperInput, GatekeeperResult, DesignerInput, DesignerResult, FailureMessage,
} from "@invariance/theming/authoring";
```

- [ ] **Step 4: Re-verify ALL suites + typechecks (the move is correct iff all stay green)**

```bash
pnpm -F @invariance/theming test        # 273
pnpm -F @invariance/control-plane test   # 245
( cd tests/verify && pnpm exec vitest run )  # 117
pnpm -F @invariance/tier-a-demo test     # current demo suite (Part-2 tests import via wiring.ts — still green)
pnpm -F @invariance/theming typecheck && pnpm -F @invariance/control-plane typecheck && pnpm -F @invariance/tier-a-demo typecheck
```
All green → commit. Any red → the move diverged; fix the re-export, not the logic.

- [ ] **Step 5: Commit**

```bash
git add packages/theming/src/authoring apps/control-plane/src/theming/authoring/failure-ux.ts apps/tier-a-demo/src/demo/wiring.ts
git commit -m "refactor(theming): extract failureTemplate into @invariance/theming/authoring; demo wiring → crypto-free subpaths"
```

---

### Task 2: `runScriptedTurn` + the per-tenant `useDemoSession` hook

**Files:**
- Create: `apps/tier-a-demo/src/demo/run-turn.ts`, `apps/tier-a-demo/src/studio/useDemoSession.ts`
- Test: `apps/tier-a-demo/test/demo-session.test.ts`

**Interfaces:**
- Produces: `runScriptedTurn(agent, session, prompt, manifest) → Promise<TurnResult>` (throws on non-in-scope gate OR unscripted prompt); `useDemoSession(agent, manifest, tenant) → { state, submit, acknowledge, publish, reset, toggleMode }` where `state = { session, outcome: TurnResult|null, notice: string|null, applied: CandidateTheme, published: boolean, mode }`.

- [ ] **Step 1: `runScriptedTurn` — write + node test**

`apps/tier-a-demo/src/demo/run-turn.ts`:
```typescript
import type { AppManifest } from "@invariance/theming/manifest";
import { type Agent, type Session, type TurnResult, buildEnvelope, runTurn } from "./wiring.js";

// One turn as the UI runs it: gatekeep → (in scope) design → the real engine turn. The agent only
// SUPPLIES the proposal; runTurn produces the verdict. Throws on a non-in-scope gate or an unscripted
// prompt (the caller catches → a `notice`). No fabricated TurnResult.
export async function runScriptedTurn(agent: Agent, session: Session, prompt: string, manifest: AppManifest): Promise<TurnResult> {
  const envelope = buildEnvelope(manifest);
  const gate = await agent.gatekeep({ prompt, envelope });
  if (gate.classification !== "in_scope_styling") throw new Error(`gate: ${gate.classification}`);
  const designed = await agent.design({ prompt, draft: session.draft, envelope });
  return runTurn(session, designed.specJson, manifest);
}
```
`test/demo-session.test.ts` (node): drive each scripted prompt → assert Part-2 outcomes (indigo→diff, saturated→contrast_floor/muted-fg, error→seed_locked); an unscripted prompt → `await expect(runScriptedTurn(...)).rejects.toThrow()`. Run → PASS.

- [ ] **Step 2: `useDemoSession` — write**

`apps/tier-a-demo/src/studio/useDemoSession.ts`:
```typescript
import { compile } from "@invariance/theming/compile";
import { useCallback, useState } from "react";
import type { AppManifest } from "@invariance/theming/manifest";
import { type Agent, APP_DEFAULT_SPEC, type CandidateTheme, type Session, type TurnResult, acknowledge as ackSession } from "./wiringTypes.js"; // see note
import { runScriptedTurn } from "../demo/run-turn.js";

type Mode = "light" | "dark";
type State = { session: Session; outcome: TurnResult | null; notice: string | null; applied: CandidateTheme; published: boolean; mode: Mode };

export function useDemoSession(agent: Agent, manifest: AppManifest, tenant: string) {
  const base = compile(APP_DEFAULT_SPEC, manifest);
  const [state, setState] = useState<State>({
    session: { tenant, draft: APP_DEFAULT_SPEC, published: null },
    outcome: null, notice: null, applied: base, published: false, mode: "light",
  });

  const submit = useCallback(async (prompt: string) => {
    try {
      const outcome = await runScriptedTurn(agent, state.session, prompt, manifest);
      setState((s) => ({ ...s, outcome, notice: null,
        applied: outcome.kind === "diff" ? outcome.candidate : s.applied,
        published: outcome.kind === "diff" ? false : s.published }));
    } catch {
      setState((s) => ({ ...s, outcome: null, notice: "I don't have a styling for that — try one of the examples." }));
    }
  }, [agent, manifest, state.session]);

  const acknowledge = useCallback(() => setState((s) =>
    s.outcome?.kind === "diff"
      ? { ...s, session: ackSession({ ...s.session, candidate: s.outcome.candidate, pendingSpec: s.outcome.pendingSpec }), outcome: null }
      : s), []);

  // page-held: the real product flips the KV pointer (artifact→pointer→audit); here we mark live.
  const publish = useCallback(() => setState((s) => ({ ...s, published: true })), []);

  // app-default reset (start over). Part 5 may add reset-to-this-tenant's-published.
  const reset = useCallback(() => setState((s) => ({ ...s,
    session: { ...s.session, draft: APP_DEFAULT_SPEC, candidate: undefined, pendingSpec: undefined },
    applied: base, outcome: null, notice: null, published: false })), [base]);

  const toggleMode = useCallback(() => setState((s) => ({ ...s, mode: s.mode === "light" ? "dark" : "light" })), []);

  return { state, submit, acknowledge, publish, reset, toggleMode };
}
```
Note: import the value `acknowledge`/`APP_DEFAULT_SPEC` + types from `./wiring.js` (rename the imported `acknowledge` to `ackSession` to avoid clashing with the hook's own `acknowledge`). `CandidateTheme` type comes from `@invariance/theming/compile`.

- [ ] **Step 3: Hook test (happy-dom + @testing-library/react `renderHook`/`act` — add the devDep)**

Add `@testing-library/react` to devDeps; `pnpm install`. `test/demo-session.test.ts` (or a sibling, `@vitest-environment happy-dom`): `renderHook(() => useDemoSession(new CannedAgent(SCRIPT), DEMO_MANIFEST, "acme"))`; `await act(submit(indigo))` → `state.outcome.kind==="diff"`, `state.applied` is the candidate; `act(acknowledge)` → `state.session.draft.colors?.primary` defined, `outcome` null; `await act(submit(errorPrompt))` → `state.outcome.kind==="rejected"` AND `state.applied` unchanged (the committed indigo, NOT disturbed); `act(reset)` → `applied` back to base, draft empty, published false. Run → PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/tier-a-demo/src/demo/run-turn.ts apps/tier-a-demo/src/studio/useDemoSession.ts apps/tier-a-demo/test/demo-session.test.ts apps/tier-a-demo/package.json pnpm-lock.yaml
git commit -m "feat(tier-a-demo): runScriptedTurn + per-tenant useDemoSession (applied-advances-on-diff, notice for unscripted)"
```

---

### Task 3: `OutcomePanel` — driven by `failureTemplate`

**Files:**
- Create: `apps/tier-a-demo/src/studio/OutcomePanel.tsx`
- Test: `apps/tier-a-demo/test/outcome-panel.test.tsx`

**Interfaces:**
- Produces: `OutcomePanel({ outcome, onAcknowledge })` — `outcome: TurnResult | null`.

- [ ] **Step 1: Build the panel (3 outcomes; rejection copy from `failureTemplate`)**

`OutcomePanel.tsx`: switch on `outcome?.kind`:
- `undefined`/`null` → idle hint ("Pick a prompt to start.").
- `"diff"` → field rows from `outcome.diff` (each `FieldDiff`: `role`, a `from`→`to` pair with color swatches for hsl-triple roles `<span style={{background:"hsl("+to+")"}}/>`, plain text for radius/density, the `kind`), + an **Acknowledge** button (`onAcknowledge`).
- `"no_change"` → "No visual change from that." (calm).
- `"rejected"` → for each failure: `const m = failureTemplate(failure)` (imported from `../demo/wiring.js`); render `m.headline` (bold), `m.detail`, and `m.suggestion` if present — the ENGINE's copy. Wrap in a dramatic block (border/emphasis via `hsl(var(--destructive))`) with a local "Your design is unchanged." line. (No local headline map; `rejected` always has ≥1 real failure.)

- [ ] **Step 2: Render test (each outcome) — write, run (PASS)**

`outcome-panel.test.tsx` (`@vitest-environment happy-dom`, `@testing-library/react`): render a `diff` outcome (assert a swatch + an Acknowledge that fires `onAcknowledge` on click); `no_change` (the text); a `rejected` outcome carrying a real `seed_locked` `WallFailure` (`{ code:"seed_locked", path:"colors.destructive", message:"…" }`) → assert the rendered text contains `failureTemplate`'s headline ("locked by the app") — i.e. it matches the engine copy, proving it's not a UI-local string; `null` (idle). Run → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/tier-a-demo/src/studio/OutcomePanel.tsx apps/tier-a-demo/test/outcome-panel.test.tsx
git commit -m "feat(tier-a-demo): OutcomePanel — diff swatches / no-change / rejection rendered from the engine's failureTemplate"
```

---

### Task 4: `PromptBox` + `SessionControls` + the studio layout

**Files:**
- Create: `apps/tier-a-demo/src/studio/PromptBox.tsx`, `apps/tier-a-demo/src/studio/SessionControls.tsx`
- Modify: `apps/tier-a-demo/src/App.tsx`

**Interfaces:**
- `PromptBox({ examples, onSubmit })`; `SessionControls({ canAcknowledge, published, onAcknowledge, onPublish, onReset })`.

- [ ] **Step 1: PromptBox + SessionControls (presentational)**

`PromptBox.tsx`: `<input data-testid="prompt-input">` + Send (`onSubmit(value)`), and `examples` as `<button data-testid="example">` calling `onSubmit(ex)`. `SessionControls.tsx`: Acknowledge (`data-testid="acknowledge"`, disabled unless `canAcknowledge`), Publish (`data-testid="publish"`, label "Live ✓" when `published`), Reset (`data-testid="reset"`).

- [ ] **Step 2: App studio layout (customizer + live preview + notice banner)**

`App.tsx`: `const demo = useDemoSession(new CannedAgent(SCRIPT), DEMO_MANIFEST, "acme")`. Left column: `PromptBox` (examples = `Object.keys(SCRIPT)`, onSubmit = `demo.submit`); a `notice` banner when `demo.state.notice`; `OutcomePanel` (outcome=`demo.state.outcome`, onAcknowledge=`demo.acknowledge`); `SessionControls` (canAcknowledge=`demo.state.outcome?.kind==="diff"`, published=`demo.state.published`, …); a light/dark toggle (`demo.toggleMode`). Right column: the preview wrapper (`data-testid="scope"`) with `<AnalyticsDashboard/>`, effect `applyScoped(wrapperRef.current!, demo.state.applied, demo.state.mode)` on `[demo.state.applied, demo.state.mode]`. `pnpm -F @invariance/tier-a-demo build` → succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/tier-a-demo/src/studio/PromptBox.tsx apps/tier-a-demo/src/studio/SessionControls.tsx apps/tier-a-demo/src/App.tsx
git commit -m "feat(tier-a-demo): studio layout — PromptBox + SessionControls + OutcomePanel beside the live preview"
```

---

### Task 5: chromium e2e — the loop, incl. rejection-after-publish

**Files:**
- Test: `apps/tier-a-demo/test/loop.chromium.test.ts`

- [ ] **Step 1: Write the e2e (dev-server + chromium harness from Part 3's cascade test)**

`loop.chromium.test.ts`: on the page —
  1. read the CTA's base computed background (before any prompt).
  2. click the **indigo** example → click **Acknowledge** → click **Publish** → `waitForFunction` the wrapper's `--primary` changed → CTA bg equals the **independently-derived** themed indigo (compile in node, `hslTripleToSrgb`×255), and **differs from base**; the Publish control reads "Live".
  3. capture the (published, indigo) CTA bg, then click the **error-recolor** example → assert the rejection panel is shown (`[data-testid="rejection"]`) AND the CTA bg is **unchanged from the published indigo** — a governance rejection does NOT disturb a customized, published look (the on-camera-relevant version of preview-unchanged).

- [ ] **Step 2: Run + full suite + commit**

`pnpm -F @invariance/tier-a-demo test` → all green; `typecheck` clean.
```bash
git add apps/tier-a-demo/test/loop.chromium.test.ts
git commit -m "test(tier-a-demo): chromium e2e — prompt→acknowledge→publish re-themes; a rejection refuses without disturbing the published look"
```

---

## Self-Review

**1. Spec coverage (§8 Part 3):** `PromptBox`/`OutcomePanel`/`SessionControls` (Tasks 3–4), the per-tenant page-held session over the `CannedAgent` + real engine (Task 2), the three outcomes with rejection rendered from the engine's `failureTemplate` (Tasks 1+3), the loop proven in chromium incl. rejection-after-publish (Task 5). Two-tenant side-by-side + light/dark climax + polish = Part 5.

**2. Placeholder scan:** the `failureTemplate` move is concrete (exact source identified); the hook is given in full; `OutcomePanel`/`PromptBox`/`SessionControls` by exact props + `data-testid`s + the per-outcome rendering. `@testing-library/react` named as the hook/component test tool. No "TBD".

**3. Type consistency:** `runScriptedTurn(...): Promise<TurnResult>` used by the hook + Task-2 test. `state.applied: CandidateTheme` feeds `applyScoped`. `failureTemplate(failure): FailureMessage` rendered by `OutcomePanel`. `wiring.ts` re-exports the same names from subpaths (+ `failureTemplate`/`FailureMessage`), so Part-2 imports are unaffected. `useDemoSession(agent, manifest, tenant)` — `tenant` carried now; Part 5 = one instance per tenant.

**Decisions settled (per review):** (a) rejection copy = engine `failureTemplate`, extracted to the package; (b) gate-reject sentinel dropped → `notice`; (c) `publish` = page-held boolean (named), and the e2e asserts rejection-unchanged AFTER publish; (d) `reset` = app-default (Part 5 may add reset-to-published); (e) per-tenant keying via the `tenant` param now (Part 5 instantiates per tenant).
