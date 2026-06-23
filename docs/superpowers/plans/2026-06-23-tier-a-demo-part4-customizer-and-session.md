# Tier-A Demo — Part 4: Customizer UI + Page-Held Session — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the live customize loop — a prompt (typed or a scripted example) drives the `CannedAgent` → the real engine turn → the three outcomes surface in an `OutcomePanel` (rejection first-class) → an accepted diff re-themes the live preview → acknowledge/publish/reset over a page-held session.

**Architecture:** All client-side. A reusable `runScriptedTurn` (gatekeep → design → `runTurn`) over the `CannedAgent` + the real engine; a thin `useDemoSession` React hook holding the `Session` + the currently-applied candidate in page state; presentational `PromptBox` / `OutcomePanel` / `SessionControls`; and the App becomes a studio (customizer beside the Part-3 dashboard preview, whose `applyScoped` follows the applied candidate). The engine half is imported from the **crypto-free subpaths** (browser bundle).

**Tech Stack:** React 18, Vite, Tailwind v3 (layout-only), vitest (node + happy-dom for hook/render logic; chromium for the e2e), `@invariance/theming`.

## Global Constraints

- **All four scripted beats are `in_scope_styling`** (Part 2 SCRIPT). The gate is a UX surface, not the safety gate; an *unscripted* typed prompt makes `CannedAgent` throw → caught → a gentle "try an example" state (never a crash).
- **Rejection is first-class.** `OutcomePanel` renders the three `TurnResult` kinds; for `rejected`, it shows a per-code headline + the failure's deterministic `message` (already on each `WallFailure`/`VerifyFailure`), styled for the camera. (We render the failures' own deterministic `message` rather than importing control-plane `failureTemplate` — same deterministic copy, no extra cross-app dependency; `failureTemplate` stays the Plan-08 path.)
- **A rejected/no_change turn must NOT change the preview** — the applied candidate only advances on a `diff`. (Engine guarantees the draft is untouched; the UI must mirror that.)
- **Browser code imports the engine from crypto-free subpaths** (`@invariance/theming/session`, `/authoring`, `/compile`, `/spec`, `/manifest`) — never the barrel (it pulls `node:crypto`). Task 1 repoints `wiring.ts` accordingly.
- **Branch:** continue on `tier-a-demo`. Testing light per spec §7: hook logic test + `OutcomePanel` render test + ONE chromium e2e (prompt→preview re-themes; rejection→preview unchanged).
- Engine facts: `runTurn`/`acknowledge`/`APP_DEFAULT_SPEC`/`Session`/`TurnResult` ∈ `@invariance/theming/session`; `Agent`/`GateClassification`/`buildEnvelope` ∈ `@invariance/theming/authoring`; `compile` ∈ `@invariance/theming/compile`. `TurnResult.diff` is `FieldDiff[]` = `{ role, from: string|null, to: string|null, kind: "added"|"changed"|"removed" }` (resolved values). `acknowledge` reads `session.pendingSpec`.

---

### Task 1: Browser-safe wiring + `runScriptedTurn` + `useDemoSession`

**Files:**
- Modify: `apps/tier-a-demo/src/demo/wiring.ts` (re-export from crypto-free subpaths)
- Create: `apps/tier-a-demo/src/demo/run-turn.ts`, `apps/tier-a-demo/src/studio/useDemoSession.ts`
- Test: `apps/tier-a-demo/test/demo-session.test.ts`

**Interfaces:**
- Produces: `runScriptedTurn(agent, session, prompt, manifest) → Promise<TurnResult>` (throws only if the agent throws — unscripted prompt); `useDemoSession(agent, manifest) → { state, submit, acknowledge, publish, reset, toggleMode }` where `state = { session, outcome, applied: CandidateTheme, published: boolean, mode }`.

- [ ] **Step 1: Repoint `wiring.ts` to the crypto-free subpaths (browser-safe, one wiring module)**

```typescript
// apps/tier-a-demo/src/demo/wiring.ts — subpaths only (the barrel pulls node:crypto via artifact)
export { runTurn, acknowledge, APP_DEFAULT_SPEC } from "@invariance/theming/session";
export type { Session, TurnResult } from "@invariance/theming/session";
export { buildEnvelope } from "@invariance/theming/authoring";
export type {
  Agent, GateClassification, GatekeeperInput, GatekeeperResult, DesignerInput, DesignerResult,
} from "@invariance/theming/authoring";
```
Run `pnpm -F @invariance/tier-a-demo test` → the Part-2 tests (which import via `wiring.ts`) stay green (subpaths export the same symbols; node resolves them fine).

- [ ] **Step 2: `runScriptedTurn` (reusable gatekeep → design → runTurn) — write + node test**

`apps/tier-a-demo/src/demo/run-turn.ts`:
```typescript
import type { AppManifest } from "@invariance/theming/manifest";
import { type Agent, type Session, type TurnResult, buildEnvelope, runTurn } from "./wiring.js";

// One turn exactly as the UI runs it: gatekeep → (in scope) design → the real engine turn. The agent
// only SUPPLIES the proposal; runTurn produces the verdict. Throws only if the agent has no canned
// response (an unscripted prompt) — the caller catches that.
export async function runScriptedTurn(agent: Agent, session: Session, prompt: string, manifest: AppManifest): Promise<TurnResult> {
  const envelope = buildEnvelope(manifest);
  const gate = await agent.gatekeep({ prompt, envelope });
  if (gate.classification !== "in_scope_styling") {
    return { kind: "rejected", failures: [] }; // gate UX-reject (not used by the 4 scripted beats)
  }
  const designed = await agent.design({ prompt, draft: session.draft, envelope });
  return runTurn(session, designed.specJson, manifest);
}
```
`apps/tier-a-demo/test/demo-session.test.ts` (node): drive each scripted prompt through `runScriptedTurn(new CannedAgent(SCRIPT), fresh, prompt, DEMO_MANIFEST)` and assert the same outcomes Part 2 proved (indigo→diff, saturated→contrast_floor/muted-fg, error→seed_locked); plus an unscripted prompt rejects via a thrown error (`await expect(...).rejects`). Run → PASS.

- [ ] **Step 3: `useDemoSession` hook — write + happy-dom test**

`apps/tier-a-demo/src/studio/useDemoSession.ts`: holds `state = { session, outcome, applied, published, mode }`; `applied` starts at `compile(APP_DEFAULT_SPEC, manifest)` (the base look). Operations:
- `submit(prompt)`: `try { const outcome = await runScriptedTurn(agent, session, prompt, manifest); setState(s => ({ ...s, outcome, applied: outcome.kind === "diff" ? outcome.candidate : s.applied, published: outcome.kind === "diff" ? false : s.published })) } catch { setState(s => ({ ...s, outcome: { kind: "rejected", failures: [] } })) }`
- `acknowledge()`: if `outcome?.kind === "diff"` → `session = acknowledge({ ...session, candidate: outcome.candidate, pendingSpec: outcome.pendingSpec })`; clear `outcome` (applied stays = the committed candidate).
- `publish()`: `published = true` (page-held — flags the applied look as live).
- `reset()`: `session.draft = APP_DEFAULT_SPEC` (clear candidate/pendingSpec); `applied = compile(APP_DEFAULT_SPEC, manifest)`; `outcome = null`; `published = false`.
- `toggleMode()`: flip light/dark.

`compile`/`APP_DEFAULT_SPEC` import from `@invariance/theming/compile` + `./demo/wiring.js`. Test (`// @vitest-environment happy-dom`, with `@testing-library/react`'s `renderHook` + `act` — add it as a devDep, it's the clean way to test a hook): submit the indigo prompt → `state.applied` becomes the diff candidate, `outcome.kind === "diff"`; acknowledge → `session.draft.colors.primary` defined, `outcome` null; submit the error prompt → `outcome.kind === "rejected"` AND `state.applied` unchanged (preview held); reset → `applied` back to base, draft empty. Run → PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/tier-a-demo/src/demo/wiring.ts apps/tier-a-demo/src/demo/run-turn.ts apps/tier-a-demo/src/studio/useDemoSession.ts apps/tier-a-demo/test/demo-session.test.ts apps/tier-a-demo/package.json pnpm-lock.yaml
git commit -m "feat(tier-a-demo): page-held session (runScriptedTurn + useDemoSession) over the real engine; browser-safe wiring"
```

---

### Task 2: `OutcomePanel` (the three outcomes, rejection first-class)

**Files:**
- Create: `apps/tier-a-demo/src/studio/OutcomePanel.tsx`
- Test: `apps/tier-a-demo/test/outcome-panel.test.tsx`

**Interfaces:**
- Produces: `OutcomePanel({ outcome, onAcknowledge }: { outcome: TurnResult | null; onAcknowledge: () => void })`.

- [ ] **Step 1: Build the panel (3 outcomes)**

`OutcomePanel.tsx`: switch on `outcome.kind`:
- `null` → an idle hint ("Pick a prompt to start.").
- `"diff"` → a field-level list: each `FieldDiff` as a row showing `role`, a `from`→`to` pair with color swatches when the value parses as a color (`<span style={{background:"hsl("+to+")"}}/>` for hsl-triple roles; plain text for radius/density), the `kind` (added/changed/removed), and an **Acknowledge** button (`onAcknowledge`).
- `"no_change"` → "No visual change from that." (calm, distinct).
- `"rejected"` → a FIRST-CLASS rejection block: a per-code headline from a local map (`{ seed_locked: "Locked by the platform", contrast_floor: "Would fail accessibility", font_not_allowed: "Font not allowed", … }`, with a catch-all), each failure's deterministic `message`, and a clear "the change was refused — your design is unchanged" line. Style it legibly/dramatically (border/emphasis using `--destructive`). For `failures.length === 0` (gate UX-reject) → "That's outside what this app can be themed to."

- [ ] **Step 2: Render test (each outcome) — write, run (PASS)**

`outcome-panel.test.tsx` (`@vitest-environment happy-dom`, `@testing-library/react`): render with a `diff` outcome (assert a swatch row + an Acknowledge button that calls `onAcknowledge` on click); with `no_change` (assert the text); with a `rejected` outcome carrying a `seed_locked` failure (assert the "Locked by the platform" headline + the message); with `null` (idle hint). Run → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/tier-a-demo/src/studio/OutcomePanel.tsx apps/tier-a-demo/test/outcome-panel.test.tsx
git commit -m "feat(tier-a-demo): OutcomePanel — diff swatches / no-change / first-class rejection"
```

---

### Task 3: `PromptBox` + `SessionControls` + the studio layout

**Files:**
- Create: `apps/tier-a-demo/src/studio/PromptBox.tsx`, `apps/tier-a-demo/src/studio/SessionControls.tsx`
- Modify: `apps/tier-a-demo/src/App.tsx` (studio layout: customizer + live preview)

**Interfaces:**
- `PromptBox({ examples, onSubmit }: { examples: string[]; onSubmit: (prompt: string) => void })` — a text input + the scripted example prompts as buttons.
- `SessionControls({ canAcknowledge, published, onAcknowledge, onPublish, onReset })`.

- [ ] **Step 1: PromptBox + SessionControls (presentational)**

`PromptBox.tsx`: an `<input data-testid="prompt-input">` + a Send button (`onSubmit(value)`), and the `examples` rendered as `<button data-testid="example" onClick={() => onSubmit(ex)}>`. `SessionControls.tsx`: Acknowledge (disabled unless `canAcknowledge`), Publish (`data-testid="publish"`, shows "Live" when `published`), Reset (`data-testid="reset"`).

- [ ] **Step 2: App studio layout — customizer beside the live preview**

`App.tsx`: `const demo = useDemoSession(new CannedAgent(SCRIPT), DEMO_MANIFEST)`. Layout: left = `PromptBox` (examples = `Object.keys(SCRIPT)`) + `OutcomePanel` (outcome=demo.state.outcome, onAcknowledge=demo.acknowledge) + `SessionControls` + a light/dark toggle (`demo.toggleMode`); right = the preview wrapper (`data-testid="scope"`) containing `<AnalyticsDashboard/>`, with an effect `applyScoped(wrapperRef.current!, demo.state.applied, demo.state.mode)` on `[demo.state.applied, demo.state.mode]`. Run `pnpm -F @invariance/tier-a-demo build` → succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/tier-a-demo/src/studio/PromptBox.tsx apps/tier-a-demo/src/studio/SessionControls.tsx apps/tier-a-demo/src/App.tsx
git commit -m "feat(tier-a-demo): studio layout — PromptBox + SessionControls + OutcomePanel wired beside the live preview"
```

---

### Task 4: chromium e2e — the loop (prompt → preview re-themes; rejection → unchanged)

**Files:**
- Test: `apps/tier-a-demo/test/loop.chromium.test.ts`

**Interfaces:**
- Consumes: the real App via a Vite dev server (as in Part 3's cascade test); `SCRIPT`, `DEMO_MANIFEST`, `compile`/`parseSpec`, `hslTripleToSrgb` (`./_measure.js`).

- [ ] **Step 1: Write the e2e (model the server/browser harness on `cascade.chromium.test.ts`)**

`loop.chromium.test.ts`: dev-server + chromium. Steps on the page:
  1. read the CTA's base computed background (before any prompt) — it's the base primary.
  2. click the indigo **example** prompt (`[data-testid="example"]` whose text is the indigo prompt) → click **Acknowledge** → `waitForFunction` the wrapper's `--primary` changed → the CTA computed bg equals the **independently-derived** themed indigo primary (compile the indigo spec in node, `hslTripleToSrgb`×255), and **differs from base**.
  3. capture the CTA bg, then click the **error-recolor** example (the `seed_locked` beat) → assert an `OutcomePanel` rejection is shown (`[data-testid="rejection"]` present) AND the CTA bg is **unchanged** (the preview held — the rejected turn didn't touch it).
This proves the full loop on camera: a prompt re-themes; a governance rejection refuses without breaking the preview.

- [ ] **Step 2: Run + full suite + commit**

Run: `pnpm -F @invariance/tier-a-demo test` → all green (Parts 1–3 suites + demo-session + outcome-panel + loop.chromium). `pnpm -F @invariance/tier-a-demo typecheck` clean.
```bash
git add apps/tier-a-demo/test/loop.chromium.test.ts
git commit -m "test(tier-a-demo): chromium e2e — a prompt re-themes the preview; a rejection refuses without changing it"
```

---

## Self-Review

**1. Spec coverage (§8 Part 3 "Customizer + page-session"):** `PromptBox`/`OutcomePanel`/`SessionControls` (Tasks 2–3), the page-held session driving the `CannedAgent` + real engine (Task 1), the three outcomes with rejection first-class (Task 2), and the loop proven end-to-end in chromium (Task 4). Two-tenant side-by-side + the light/dark climax + recording polish remain for Part 5.

**2. Placeholder scan:** the hook/panel bodies are specified by their exact state shape, operations, and per-outcome rendering with concrete `data-testid`s and the load-bearing logic; presentational `PromptBox`/`SessionControls` are described by their props + testids (compact but unambiguous). `@testing-library/react` is added as the standard hook/component test tool (Task 1 Step 3 / Task 2). No "TBD".

**3. Type consistency:** `runScriptedTurn(agent, session, prompt, manifest): Promise<TurnResult>` is used identically by the hook and the Task-1 test. `useDemoSession`'s `state.applied: CandidateTheme` feeds `applyScoped` (Part 3 signature). `TurnResult` discriminant + `FieldDiff` fields (`role`/`from`/`to`/`kind`) match the ledger. `wiring.ts` re-exports the same names from subpaths, so Part-2 imports are unaffected.

**Note:** browser code must import the engine from subpaths, not the barrel (the recurring `node:crypto` constraint). Task 1 Step 1 makes `wiring.ts` the single browser-safe wiring module; `OutcomePanel`/hook/App import `compile` from `@invariance/theming/compile` and the rest via `wiring.ts`.
