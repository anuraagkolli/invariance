# Tier-A Demo — Part 2: Encode + Assert the Beats (no UI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the demo's governance proof in committed tests — the real demo manifest + the `CannedAgent` with the four scripted specs, with tests asserting **on the real engine** that the hero lock beat fires `seed_locked`, the secondary contrast beat fires `contrast_floor` on `muted-fg`, and the success beats produce an accepted `diff` — before any UI is built.

**Architecture:** Builds on Part 1's `apps/tier-a-demo` package (TS + vitest, no UI). The demo holds session **in the page**, but runs the *real* control-plane Tier-A state machine (`runTurn`/`acknowledge`, pure, browser-safe) over the *real* engine half (`parseSpec → mergeDelta → diffSpecs → compile → verify`), reached by a thin relative re-export (`src/demo/wiring.ts`) — the same pattern the verification suite used. The `CannedAgent` implements the real `Agent` interface (the agent-selector seam: canned now → MockAgent → qwen later); it only *supplies* proposals — every accept/reject verdict comes from the engine.

**Tech Stack:** TypeScript (ESM, strict), vitest (node), `@invariance/theming`, control-plane Tier-A theming source (relative import, type-and-value).

## Global Constraints

- **Settled by the Part-1 spike (`apps/tier-a-demo/MECHANISM-FINDINGS.md`):** tier = **AA**; hero = the **lock** beat (`seed_locked` on `destructive`); secondary = the AA **`muted-fg/muted`** contrast rejection under a saturated `neutral`. Surfaces are profile-anchored. Confirmed canned values: success primary `oklch(0.35 0.12 270)` (≈11.6:1), success neutral `oklch(0.95 0.03 60)` (≈20:1).
- **Contrast-reject margin (measured 2026-06-23 — the beat is ROBUST, not rounding-fragile):** `oklch(0.45 0.18 30)` → emitted `muted-fg/muted` ≈ **2.31:1**, a 0.69 margin below the 3.0 large-text floor; the whole band L∈[0.40,0.55] × C∈[0.12,0.30] rejects at **2.06–2.67**. `minimum-legible` does not reach a high-contrast extreme against a saturated muted surface, so the failure is wide, not a near-threshold hair — but Part 2 PINS the margin + band so a future ramp tweak can't silently flip the demo's only contrast beat to passing.
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

- [ ] **Step 1b: Validate the relative-import depth NOW (the one fragile wiring point) — before building on it**

`apps/tier-a-demo/test/wiring.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { acknowledge, APP_DEFAULT_SPEC, buildEnvelope, runTurn } from "../src/demo/wiring.js";

describe("wiring", () => {
  it("re-exports the real control-plane Tier-A stages (relative-import depth is correct)", () => {
    expect(typeof runTurn).toBe("function");
    expect(typeof acknowledge).toBe("function");
    expect(typeof buildEnvelope).toBe("function");
    expect(APP_DEFAULT_SPEC).toBeDefined();
  });
});
```
Run: `pnpm -F @invariance/tier-a-demo test wiring` (and `pnpm -F @invariance/tier-a-demo typecheck`).
Expected: PASS. If it errors `cannot find module`, the `../../../` depth is wrong — `wiring.ts` is at
`apps/tier-a-demo/src/demo/`, so up three (`demo`→`src`→`tier-a-demo`) lands in `apps/`, then into
`control-plane/src/theming/authoring/…`. Fix the depth here, before Tasks 2–3 build on it.

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
- Consumes: `DEMO_MANIFEST`, `CannedAgent`, `SCRIPT`, `runTurn`, `acknowledge`, `APP_DEFAULT_SPEC`, `buildEnvelope`, `Session`, `TurnResult`; `@invariance/theming` `parseSpec`/`compile`; `contrast` from `./_measure.js` (Part 1).
- Produces: the committed proof that each scripted beat yields its intended outcome (incl. the contrast beat's pinned margin + band, and the `no_change` outcome) — the gate the whole demo rests on.

- [ ] **Step 1: Write the beat-driver + all outcome assertions (the failing test)**

`apps/tier-a-demo/test/beats.test.ts`:
```typescript
import { compile, type CandidateTheme, parseSpec } from "@invariance/theming";
import { describe, expect, it } from "vitest";
import { DEMO_MANIFEST } from "../src/demo/manifest.js";
import { CannedAgent } from "../src/demo/canned-agent.js";
import { SCRIPT } from "../src/demo/script.js";
import { APP_DEFAULT_SPEC, type Session, type TurnResult, acknowledge, buildEnvelope, runTurn } from "../src/demo/wiring.js";
import { contrast } from "./_measure.js";

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
function compileNeutral(neutral: string): CandidateTheme {
  const p = parseSpec({ colors: { neutral } }, DEMO_MANIFEST);
  if (!p.ok) throw new Error(`rejected: ${JSON.stringify(p.failures)}`);
  return compile(p.spec, DEMO_MANIFEST);
}

const INDIGO = "Make it feel like Acme — deep indigo, a little more rounded.";
const WARM = "Warmer, lighter surfaces.";
const SATURATED = "Make the surfaces a bold, saturated orange.";
const RECOLOR_ERROR = "Recolor the error state to a friendly green.";

describe("scripted beats fire their intended engine outcome (the governance proof)", () => {
  it("beat #2 (deep indigo, rounded) → accepted diff, with a populated dark var set", async () => {
    const t = await driveBeat(fresh(), INDIGO);
    expect(t.kind).toBe("diff");
    if (t.kind !== "diff") return;
    expect(t.diff.some((d) => d.role === "primary")).toBe(true);
    // both-mode proof: an accepted diff already means verify passed every allowed mode; assert dark is
    // actually emitted so a future change that drops dark from the manifest fails loudly here.
    expect(t.candidate.dark && Object.keys(t.candidate.dark).length > 0).toBe(true);
  });

  it("beat #3 (warmer, lighter surfaces) → accepted diff touching neutral + accent", async () => {
    const t = await driveBeat(fresh(), WARM);
    expect(t.kind).toBe("diff");
    if (t.kind !== "diff") return;
    expect(t.diff.some((d) => d.role === "neutral")).toBe(true);
    expect(t.diff.some((d) => d.role === "accent")).toBe(true);
  });

  it("beat #4 (saturated surfaces) → SECONDARY: contrast_floor on muted-fg", async () => {
    const t = await driveBeat(fresh(), SATURATED);
    expect(t.kind).toBe("rejected");
    if (t.kind !== "rejected") return;
    expect(t.failures.some((f) => "code" in f && f.code === "contrast_floor")).toBe(true);
    expect(t.failures.some((f) => "pair" in f && f.pair?.fg === "muted-fg")).toBe(true);
  });

  it("beat #5 (recolor the locked error state) → HERO: seed_locked at the wall", async () => {
    const t = await driveBeat(fresh(), RECOLOR_ERROR);
    expect(t.kind).toBe("rejected");
    if (t.kind !== "rejected") return;
    expect(t.failures.some((f) => "code" in f && f.code === "seed_locked")).toBe(true);
  });
});

describe("the contrast beat is ROBUST (pinned margin + band) — a ramp tweak can't silently kill it", () => {
  it("the canned saturated neutral fails muted-fg/muted with margin (measured ≈2.31, assert ≤2.7 — well below 3.0)", () => {
    const spec = SCRIPT[SATURATED].spec as { colors: { neutral: string } };
    const ratio = contrast(
      compileNeutral(spec.colors.neutral).light["--muted-foreground"],
      compileNeutral(spec.colors.neutral).light["--muted"],
    );
    expect(ratio).toBeLessThan(2.7); // measured ≈2.31; margin >0.3 below the 3.0 large-text floor
  });

  it("a band of saturated neutrals around the canned value also fails the floor (measured 2.06–2.67)", () => {
    for (const L of [0.45, 0.5]) {
      for (const C of [0.12, 0.18, 0.24]) {
        const t = compileNeutral(`oklch(${L} ${C} 30)`);
        const ratio = contrast(t.light["--muted-foreground"], t.light["--muted"]);
        expect(ratio, `oklch(${L} ${C} 30)`).toBeLessThan(3.0); // whole band rejects, not a knife-edge
      }
    }
  });
});

describe("the no_change outcome (the third TurnResult kind — Part 3's 'nothing moved' state)", () => {
  it("re-submitting an already-acknowledged value yields kind:no_change", async () => {
    let s = fresh();
    const t1 = await driveBeat(s, INDIGO);
    expect(t1.kind).toBe("diff");
    if (t1.kind !== "diff") return;
    s = acknowledge({ ...s, candidate: t1.candidate, pendingSpec: t1.pendingSpec });
    const t2 = await driveBeat(s, INDIGO); // same delta onto the now-indigo draft → empty diff
    expect(t2.kind).toBe("no_change");
  });
});

describe("session accumulation (the page-held draft composes across acks)", () => {
  it("two acknowledged success beats compose into one draft", async () => {
    let s = fresh();
    const t1 = await driveBeat(s, INDIGO);
    if (t1.kind !== "diff") throw new Error("beat #2 should diff");
    s = acknowledge({ ...s, candidate: t1.candidate, pendingSpec: t1.pendingSpec });
    const t2 = await driveBeat(s, WARM);
    if (t2.kind !== "diff") throw new Error("beat #3 should diff");
    s = acknowledge({ ...s, candidate: t2.candidate, pendingSpec: t2.pendingSpec });
    expect(s.draft.radius).toBe(14); // from beat #2
    expect(s.draft.colors?.primary).toBeDefined(); // beat #2
    expect(s.draft.colors?.neutral).toBeDefined(); // beat #3 — composed, not overwritten
  });
});
```

- [ ] **Step 2: Run — read outcomes; if a rejection beat doesn't fire, retune (measure-first)**

Run: `pnpm -F @invariance/tier-a-demo test beats`
Expected: PASS (8 tests). If beat #4 does NOT reject on the two-mode manifest (the probe was light-only),
`console.log(JSON.stringify(t))`, read the verdict, and retune the saturated-neutral value within the
confirmed failing band (L 0.40–0.55 × C 0.12–0.30, all measured 2.06–2.67) until it rejects on
`muted-fg`; update `SCRIPT`. Do NOT weaken an assertion to pass — the beat must genuinely fire with margin.

- [ ] **Step 3: Run the whole package suite green and commit**

Run: `pnpm -F @invariance/tier-a-demo test`
Expected: all green (smoke + mechanism-probe + manifest + wiring + canned-agent + beats).
```bash
git add apps/tier-a-demo/test/beats.test.ts apps/tier-a-demo/src/demo/script.ts
git commit -m "test(tier-a-demo): beat-assertion gate — lock(hero)+muted-fg(secondary,margin+band) reject, success accept, no_change, draft composes"
```

---

## Self-Review

**1. Spec coverage:** this plan implements the deferred §8-Part-1.iii "encode the manifest + CannedAgent + beat-assertions" against the settled (AA / lock-hero / muted-fg-secondary) facts. The success beats (#2/#3, with roles asserted in the diff and beat #2's dark var set populated), both rejection beats (#4 with a **pinned margin ≤2.7 + a failing band**, #5 the `seed_locked` hero), and the **`no_change`** third outcome each map to a `beats.test.ts` assertion; the demo manifest's lock/tier/modes map to `manifest.test.ts`; the agent-selector seam maps to `CannedAgent`; the fragile relative-import depth is validated early by `wiring.test.ts` (Task 2 Step 1b). UI (canvas, applyScoped, customizer, side-by-side) remains for Part 3+.

**2. Placeholder scan:** every step has complete code. The only "retune if needed" instruction (Task 3 Step 2) is a measure-first guard with a concrete confirmed starting value (`oklch(0.45 0.18 30)`), not a placeholder; the dark-base values are concrete (the verification-validated shadcn zinc set).

**3. Type consistency:** `CannedTurn` is defined once in `script.ts` and imported by `canned-agent.ts`; `Agent`/`Session`/`TurnResult`/`GateClassification`/`buildEnvelope`/`runTurn`/`acknowledge`/`APP_DEFAULT_SPEC` are re-exported once from `wiring.ts` and consumed by Tasks 2–3. `DEMO_MANIFEST` is an `AppManifest`. The `TurnResult` discriminant (`kind: "diff"|"no_change"|"rejected"`) and `VerifyFailure`/`WallFailure` field names (`code`, `pair?.fg`) match the ledger §6.1 and the verification suite.

**Note on the relative import depth:** validated early by `wiring.test.ts` + `typecheck` (Task 2 Step 1b) rather than discovered at Task 3. (When Part 3 introduces the Vite build, if cross-app bundling is awkward, extract `runTurn`/`acknowledge` into `@invariance/theming/session` or copy the ~15-line reducer into the demo — a Part-3 decision, not this plan's.)
