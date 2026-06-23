# Tier-A Demo — Part 2: Encode + Assert the Beats (no UI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the demo's governance proof in committed tests — the real demo manifest + the `CannedAgent` with the four scripted specs, with tests asserting **on the real engine** that the hero lock beat fires `seed_locked`, the secondary contrast beat fires `contrast_floor` on `muted-fg`, and the success beats produce an accepted `diff` — before any UI is built.

**Architecture:** Builds on Part 1's `apps/tier-a-demo` package (TS + vitest, no UI). The demo holds session **in the page**, but runs the *real* control-plane Tier-A state machine (`runTurn`/`acknowledge`, pure, browser-safe) over the *real* engine half (`parseSpec → mergeDelta → diffSpecs → compile → verify`), reached by a thin relative re-export (`src/demo/wiring.ts`) — the same pattern the verification suite used. The `CannedAgent` implements the real `Agent` interface (the agent-selector seam: canned now → MockAgent → qwen later); it only *supplies* proposals — every accept/reject verdict comes from the engine.

**Tech Stack:** TypeScript (ESM, strict), vitest (node), `@invariance/theming`, control-plane Tier-A theming source (relative import, type-and-value).

## Global Constraints

- **Settled by the Part-1 spike (`apps/tier-a-demo/MECHANISM-FINDINGS.md`):** tier = **AA**; hero = the **lock** beat (`seed_locked` on `destructive`); secondary = the AA **`muted-fg/muted`** contrast rejection under a saturated `neutral`. Surfaces are profile-anchored. Confirmed canned values: success primary `oklch(0.35 0.12 270)` (≈11.6:1), success neutral `oklch(0.95 0.03 60)` (≈20:1), contrast-reject neutral `oklch(0.45 0.18 30)` (trips `muted-fg`).
- **Do NOT modify engine or control-plane source.** The demo only consumes them.
- **Rejections come from the real engine** (`parseSpec`/`verify`); the `CannedAgent` only supplies the proposal `specJson`.
- **No UI, no Vite/React.** vitest `environment: "node"`.
- **Branch:** continue on `tier-a-demo`.
- Engine facts (ledger §6.1): `runTurn(session, delta: unknown, manifest) → TurnResult` (`{kind:"diff",diff,candidate,pendingSpec} | {kind:"no_change"} | {kind:"rejected",failures}`); `acknowledge(session)` commits `pendingSpec→draft`; `Session = {tenant, draft, candidate?, pendingSpec?, published}`; `APP_DEFAULT_SPEC = canonicalize({})`; `Agent.gatekeep({prompt,envelope})→{classification}`, `Agent.design({prompt,draft,envelope})→{specJson}`; `buildEnvelope(manifest)`. `VerifyFailure` has `{code, pair?:{fg,bg,category}, ...}`; `WallFailure` has `{code, path, message}`. `destructive` is a seed (`{kind:"seed"}`) → locking it is a seed lock (wall rejects re-seed).

---

### Task 1: The demo manifest (two-mode, AA, `destructive` locked)

**Files:**
- Create: `apps/tier-a-demo/src/demo/manifest.ts`
- Test: `apps/tier-a-demo/test/manifest.test.ts`

**Interfaces:**
- Consumes: `@invariance/theming` — `AppManifest` (schema value + type), `SHADCN_CAN`.
- Produces: `export const DEMO_MANIFEST: AppManifest` — two-mode, tier AA, `locks:["destructive"]`, brand seeds (`primary`/`accent`/`neutral`) unlocked.

- [ ] **Step 1: Write the manifest**

`apps/tier-a-demo/src/demo/manifest.ts`:
```typescript
import { AppManifest, SHADCN_CAN } from "@invariance/theming";

// Standard shadcn "zinc" dark base — AA-designed (same values the verification suite validated).
const SHADCN_DARK: Record<string, string> = {
  background: "240 10% 3.9%",
  foreground: "0 0% 98%",
  card: "240 10% 3.9%",
  "card-fg": "0 0% 98%",
  popover: "240 10% 3.9%",
  "popover-fg": "0 0% 98%",
  primary: "0 0% 98%",
  "primary-fg": "240 5.9% 10%",
  secondary: "240 3.7% 15.9%",
  "secondary-fg": "0 0% 98%",
  accent: "240 3.7% 15.9%",
  "accent-fg": "0 0% 98%",
  destructive: "0 62.8% 30.6%",
  "destructive-fg": "0 0% 98%",
  muted: "240 3.7% 15.9%",
  "muted-fg": "240 5% 64.9%",
  border: "240 3.7% 15.9%",
  input: "240 3.7% 15.9%",
  ring: "240 4.9% 83.9%",
};

// The demo platform's manifest: brand seeds (primary/accent/neutral) are CUSTOMIZABLE; the platform
// LOCKS its error-state color (destructive); contrast tier AA (the realistic standard — the standard
// base already clears it, so refBasePassesTier accepts this without an AAA base).
export const DEMO_MANIFEST: AppManifest = AppManifest.parse({
  ...SHADCN_CAN,
  appId: "demo",
  modes: { allowed: ["light", "dark"], default: "light", selectors: { light: ":root", dark: ".dark" } },
  base: { light: SHADCN_CAN.base.light, dark: SHADCN_DARK },
  invariants: { ...SHADCN_CAN.invariants, locks: ["destructive"] },
});
```

- [ ] **Step 2: Write the failing test**

`apps/tier-a-demo/test/manifest.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { DEMO_MANIFEST } from "../src/demo/manifest.js";

describe("DEMO_MANIFEST", () => {
  it("is a valid two-mode AA manifest that locks destructive and leaves brand seeds open", () => {
    expect(DEMO_MANIFEST.invariants.contrastTier).toBe("AA");
    expect(DEMO_MANIFEST.invariants.locks).toEqual(["destructive"]);
    expect(DEMO_MANIFEST.modes.allowed).toEqual(["light", "dark"]);
    // brand seeds the tenant must be able to change are NOT locked
    for (const seed of ["primary", "accent", "neutral"]) {
      expect(DEMO_MANIFEST.invariants.locks).not.toContain(seed);
    }
    // dark base is present (drives the climax light/dark toggle)
    expect(DEMO_MANIFEST.base.dark?.background).toBe("240 10% 3.9%");
  });
});
```

- [ ] **Step 3: Run — verify it passes (manifest constructs; `AppManifest.parse` ran `refBasePassesTier`)**

Run: `pnpm -F @invariance/tier-a-demo test manifest`
Expected: PASS. If `AppManifest.parse` THROWS (a base pair fails AA in some mode), read the thrown pair and correct that dark-base value — do NOT lower the tier.

- [ ] **Step 4: Commit**

```bash
git add apps/tier-a-demo/src/demo/manifest.ts apps/tier-a-demo/test/manifest.test.ts
git commit -m "feat(tier-a-demo): demo manifest (two-mode AA, destructive locked, brand seeds open)"
```

---

### Task 2: The `CannedAgent` + the scripted beats (the agent-selector seam)

**Files:**
- Create: `apps/tier-a-demo/src/demo/wiring.ts` (relative re-export of the control-plane Tier-A stages + Agent types)
- Create: `apps/tier-a-demo/src/demo/script.ts` (the four scripted beats)
- Create: `apps/tier-a-demo/src/demo/canned-agent.ts` (`CannedAgent implements Agent`)
- Test: `apps/tier-a-demo/test/canned-agent.test.ts`

**Interfaces:**
- Consumes: control-plane `Agent`/`GateClassification`/`GatekeeperInput`/`DesignerInput`/`GatekeeperResult`/`DesignerResult`, `runTurn`, `acknowledge`, `APP_DEFAULT_SPEC`, `buildEnvelope`, `Session`, `TurnResult`.
- Produces: `export const SCRIPT: Record<string, CannedTurn>`, `export class CannedAgent implements Agent`, and the re-exported wiring used by Task 3.

- [ ] **Step 1: Write the wiring re-export**

`apps/tier-a-demo/src/demo/wiring.ts`:
```typescript
// The demo holds session in the page but runs the REAL Tier-A state machine + engine half (both pure,
// browser-safe). These are not in the control-plane public barrel, so re-export by relative source
// path (the verification suite uses the same pattern). The real studio (Plan-08) uses the server-side
// session controller; the demo's only difference is WHERE the Session object lives.
export {
  runTurn,
  acknowledge,
  APP_DEFAULT_SPEC,
} from "../../../control-plane/src/theming/authoring/session.js";
export type { Session, TurnResult } from "../../../control-plane/src/theming/authoring/session.js";
export { buildEnvelope } from "../../../control-plane/src/theming/authoring/agent-types.js";
export type {
  Agent,
  GateClassification,
  GatekeeperInput,
  GatekeeperResult,
  DesignerInput,
  DesignerResult,
} from "../../../control-plane/src/theming/authoring/agent-types.js";
```

- [ ] **Step 2: Write the scripted beats**

`apps/tier-a-demo/src/demo/script.ts`:
```typescript
import type { GateClassification } from "./wiring.js";

export type CannedTurn = { classification: GateClassification; spec: unknown };

// The recorded narrative, keyed by the exact prompt the UI will send (clickable example prompts).
// Success values are the Part-1-confirmed seeds; the rejection beats use values the spike proved fire.
export const SCRIPT: Record<string, CannedTurn> = {
  "Make it feel like Acme — deep indigo, a little more rounded.": {
    classification: "in_scope_styling",
    spec: { colors: { primary: "oklch(0.35 0.12 270)" }, radius: 14 },
  },
  "Warmer, lighter surfaces.": {
    classification: "in_scope_styling",
    spec: { colors: { neutral: "oklch(0.95 0.03 60)", accent: "oklch(0.7 0.1 50)" } },
  },
  "Make the surfaces a bold, saturated orange.": {
    classification: "in_scope_styling",
    spec: { colors: { neutral: "oklch(0.45 0.18 30)" } }, // → contrast_floor on muted-fg (secondary beat)
  },
  "Recolor the error state to a friendly green.": {
    classification: "in_scope_styling",
    spec: { colors: { destructive: "oklch(0.6 0.15 150)" } }, // → seed_locked (hero beat)
  },
};
```

- [ ] **Step 3: Write the `CannedAgent`**

`apps/tier-a-demo/src/demo/canned-agent.ts`:
```typescript
import type { Agent, DesignerInput, DesignerResult, GatekeeperInput, GatekeeperResult } from "./wiring.js";
import type { CannedTurn } from "./script.js";

// Implements the real Agent interface (the seam): canned now → MockAgent → qwen later. It only SUPPLIES
// proposals; the engine produces every verdict. Keyed by the exact prompt string.
export class CannedAgent implements Agent {
  constructor(private readonly script: Record<string, CannedTurn>) {}

  private lookup(prompt: string): CannedTurn {
    const turn = this.script[prompt];
    if (!turn) throw new Error(`CannedAgent: no canned turn for prompt ${JSON.stringify(prompt)}`);
    return turn;
  }

  async gatekeep(input: GatekeeperInput): Promise<GatekeeperResult> {
    return { classification: this.lookup(input.prompt).classification };
  }

  async design(input: DesignerInput): Promise<DesignerResult> {
    return { specJson: this.lookup(input.prompt).spec };
  }
}
```

- [ ] **Step 4: Write the failing unit test**

`apps/tier-a-demo/test/canned-agent.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { DEMO_MANIFEST } from "../src/demo/manifest.js";
import { CannedAgent } from "../src/demo/canned-agent.js";
import { SCRIPT } from "../src/demo/script.js";
import { APP_DEFAULT_SPEC, buildEnvelope } from "../src/demo/wiring.js";

describe("CannedAgent", () => {
  const agent = new CannedAgent(SCRIPT);
  const envelope = buildEnvelope(DEMO_MANIFEST);
  const prompt = "Make it feel like Acme — deep indigo, a little more rounded.";

  it("returns the canned classification and specJson for a scripted prompt", async () => {
    expect((await agent.gatekeep({ prompt, envelope })).classification).toBe("in_scope_styling");
    expect(await agent.design({ prompt, draft: APP_DEFAULT_SPEC, envelope })).toEqual({
      specJson: { colors: { primary: "oklch(0.35 0.12 270)" }, radius: 14 },
    });
  });

  it("throws on an unscripted prompt (no silent fallback)", async () => {
    await expect(agent.gatekeep({ prompt: "not scripted", envelope })).rejects.toThrow();
  });
});
```

- [ ] **Step 5: Run — verify it passes**

Run: `pnpm -F @invariance/tier-a-demo test canned-agent`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/tier-a-demo/src/demo/wiring.ts apps/tier-a-demo/src/demo/script.ts apps/tier-a-demo/src/demo/canned-agent.ts apps/tier-a-demo/test/canned-agent.test.ts
git commit -m "feat(tier-a-demo): CannedAgent + scripted beats over the real Agent interface"
```

---

### Task 3: Beat-assertion tests — the governance proof, on the real engine

**Files:**
- Create: `apps/tier-a-demo/test/beats.test.ts`

**Interfaces:**
- Consumes: `DEMO_MANIFEST`, `CannedAgent`, `SCRIPT`, `runTurn`, `acknowledge`, `APP_DEFAULT_SPEC`, `buildEnvelope`, `Session`.
- Produces: the committed proof that each scripted beat yields its intended outcome — the gate the whole demo rests on.

- [ ] **Step 1: Write a beat-driver + the four outcome assertions (the failing test)**

`apps/tier-a-demo/test/beats.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { DEMO_MANIFEST } from "../src/demo/manifest.js";
import { CannedAgent } from "../src/demo/canned-agent.js";
import { SCRIPT } from "../src/demo/script.js";
import { APP_DEFAULT_SPEC, type Session, type TurnResult, acknowledge, buildEnvelope, runTurn } from "../src/demo/wiring.js";

const agent = new CannedAgent(SCRIPT);
const envelope = buildEnvelope(DEMO_MANIFEST);

// drive one scripted beat exactly as the UI will: gatekeep → design → runTurn (the real engine half)
async function driveBeat(session: Session, prompt: string): Promise<TurnResult> {
  const gate = await agent.gatekeep({ prompt, envelope });
  expect(gate.classification, prompt).toBe("in_scope_styling"); // all four demo prompts are in scope
  const designed = await agent.design({ prompt, draft: session.draft, envelope });
  return runTurn(session, designed.specJson, DEMO_MANIFEST);
}
const fresh = (): Session => ({ tenant: "acme", draft: APP_DEFAULT_SPEC, published: null });

describe("scripted beats fire their intended engine outcome (the governance proof)", () => {
  it("beat #2 (deep indigo, rounded) → accepted diff", async () => {
    const t = await driveBeat(fresh(), "Make it feel like Acme — deep indigo, a little more rounded.");
    expect(t.kind).toBe("diff");
    if (t.kind === "diff") expect(t.diff.some((d) => d.role === "primary")).toBe(true);
  });

  it("beat #3 (warmer, lighter surfaces) → accepted diff", async () => {
    const t = await driveBeat(fresh(), "Warmer, lighter surfaces.");
    expect(t.kind).toBe("diff");
  });

  it("beat #4 (saturated surfaces) → SECONDARY: contrast_floor on muted-fg", async () => {
    const t = await driveBeat(fresh(), "Make the surfaces a bold, saturated orange.");
    expect(t.kind).toBe("rejected");
    if (t.kind === "rejected") {
      expect(t.failures.some((f) => "code" in f && f.code === "contrast_floor")).toBe(true);
      expect(t.failures.some((f) => "pair" in f && f.pair?.fg === "muted-fg")).toBe(true);
    }
  });

  it("beat #5 (recolor the locked error state) → HERO: seed_locked at the wall", async () => {
    const t = await driveBeat(fresh(), "Recolor the error state to a friendly green.");
    expect(t.kind).toBe("rejected");
    if (t.kind === "rejected") {
      expect(t.failures.some((f) => "code" in f && f.code === "seed_locked")).toBe(true);
    }
  });
});

describe("session accumulation (the page-held draft composes across acks)", () => {
  it("two acknowledged success beats compose into one draft", async () => {
    let s = fresh();
    const t1 = await driveBeat(s, "Make it feel like Acme — deep indigo, a little more rounded.");
    expect(t1.kind).toBe("diff");
    if (t1.kind !== "diff") return;
    s = acknowledge({ ...s, candidate: t1.candidate, pendingSpec: t1.pendingSpec });
    const t2 = await driveBeat(s, "Warmer, lighter surfaces.");
    expect(t2.kind).toBe("diff");
    if (t2.kind !== "diff") return;
    s = acknowledge({ ...s, candidate: t2.candidate, pendingSpec: t2.pendingSpec });
    expect(s.draft.radius).toBe(14); // from beat #2
    expect(s.draft.colors?.primary).toBeDefined(); // beat #2
    expect(s.draft.colors?.neutral).toBeDefined(); // beat #3 — composed, not overwritten
  });
});
```

- [ ] **Step 2: Run — read outcomes; if a rejection beat doesn't fire, retune (measure-first)**

Run: `pnpm -F @invariance/tier-a-demo test beats`
Expected: PASS (5 tests). If beat #4 does NOT reject (the two-mode AA manifest behaves differently than the light-only probe), add a one-off `console.log(JSON.stringify(t))`, read the verdict, and retune the saturated-neutral value (raise chroma / move L into the failing band — the probe's `oklch(0.45 0.18 30)` is the confirmed starting point) until it rejects on `muted-fg`; update `SCRIPT`. Do NOT weaken the assertion to pass — the beat must genuinely fire.

- [ ] **Step 3: Run the whole package suite green and commit**

Run: `pnpm -F @invariance/tier-a-demo test`
Expected: all green (smoke + mechanism-probe + manifest + canned-agent + beats).
```bash
git add apps/tier-a-demo/test/beats.test.ts apps/tier-a-demo/src/demo/script.ts
git commit -m "test(tier-a-demo): beat-assertion gate — lock(hero)+muted-fg(secondary) reject, success beats accept, draft composes"
```

---

## Self-Review

**1. Spec coverage:** this plan implements the deferred §8-Part-1.iii "encode the manifest + CannedAgent + beat-assertions" against the settled (AA / lock-hero / muted-fg-secondary) facts. The success beats (#2/#3) and both rejection beats (#4/#5) each map to a `beats.test.ts` assertion; the demo manifest's lock/tier/modes map to `manifest.test.ts`; the agent-selector seam maps to `CannedAgent`. UI (canvas, applyScoped, customizer, side-by-side) remains for Part 3+.

**2. Placeholder scan:** every step has complete code. The only "retune if needed" instruction (Task 3 Step 2) is a measure-first guard with a concrete confirmed starting value (`oklch(0.45 0.18 30)`), not a placeholder; the dark-base values are concrete (the verification-validated shadcn zinc set).

**3. Type consistency:** `CannedTurn` is defined once in `script.ts` and imported by `canned-agent.ts`; `Agent`/`Session`/`TurnResult`/`GateClassification`/`buildEnvelope`/`runTurn`/`acknowledge`/`APP_DEFAULT_SPEC` are re-exported once from `wiring.ts` and consumed by Tasks 2–3. `DEMO_MANIFEST` is an `AppManifest`. The `TurnResult` discriminant (`kind: "diff"|"no_change"|"rejected"`) and `VerifyFailure`/`WallFailure` field names (`code`, `pair?.fg`) match the ledger §6.1 and the verification suite.

**Note on the relative import depth:** `wiring.ts` is at `apps/tier-a-demo/src/demo/`, so control-plane source is `../../../control-plane/src/theming/authoring/…` (up to `apps/`, across to `control-plane`). Verify the depth on first run; vitest resolves the `.js`→`.ts` mapping as it does in the verification suite. (When Part 3 introduces the Vite build, if cross-app bundling is awkward, extract `runTurn`/`acknowledge` into `@invariance/theming/session` or copy the ~15-line reducer into the demo — a Part-3 decision, not this plan's.)
