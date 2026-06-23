# Tier-A Demo — Part 1: Mechanism Spike (the empirical gate) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empirically determine, on real compiled output, *which settable seed (if any) drives a contrast pair below floor and at which tier* — the finding that decides whether the demo's hero is the contrast beat (and at AA or AAA) or the lock beat — before any UI or manifest tuning is built on an unproven assumption.

**Architecture:** A new, minimal `apps/tier-a-demo` package (TS + vitest, **no UI, no Vite/React yet**) that calls the *real, already-verified* `@invariance/theming` pipeline directly. One probe test measures (a) whether a mid-lightness `neutral` propagates to surface lightness or surfaces are pinned to the ramp's anchorL, and (b) the contrast a mid-lightness *seed-role* (`primary`/`accent`) produces, against both the AA (4.5:1) and AAA (7:1) thresholds. The output is a **decision** (recorded, and applied back to the spec).

**Tech Stack:** TypeScript (ESM, strict), vitest, `@invariance/theming` (workspace). No new runtime deps; the WCAG measurement helper is inlined in the probe test (the probe measures the engine's output to make a *product* decision — it is not re-verifying the engine).

## Global Constraints

- **Do NOT modify `@invariance/theming` or any engine source.** The demo only *consumes* it.
- **Rejections come from the real engine**, never faked — this plan asserts engine behavior directly.
- **This part ships NO UI and adds no Vite/React.** vitest `environment: "node"`.
- **This is a SPIKE: its deliverable is a DECISION that may revise the spec** (`docs/superpowers/specs/2026-06-22-tier-a-customizer-demo-design.md` §2 beats #4/#8, §4 tier, hero ranking). The manifest, CannedAgent, beat-assertion tests, and all UI are deliberately **out of scope** and planned in the next part against the settled facts.
- **Execution isolation:** start by branching off `governed-customization-redesign` (or a worktree via `superpowers:using-git-worktrees`) — do NOT build on the `verify/engine` branch.
- Engine facts (from `docs/verify/2026-06-21-engine-verification.md`, treat as the hypothesis to confirm/refute): every foreground is `foreground-of(…, "maximize-contrast")` with worst case ≈ **4.58:1**; `background`'s L was found **profile-anchored** (unreachable via legal seeds). `primary`/`accent`/`destructive` are `{kind:"seed"}` (role L = seed L). `SHADCN_CAN` is light-only, locks `["primary"]`, tier AA, chromaCap 0.3.

---

### Task 1: Scaffold the `apps/tier-a-demo` package (no UI)

**Files:**
- Create: `apps/tier-a-demo/package.json`
- Create: `apps/tier-a-demo/vitest.config.ts`
- Create: `apps/tier-a-demo/tsconfig.json`
- Test: `apps/tier-a-demo/test/smoke.test.ts`

**Interfaces:**
- Consumes: `@invariance/theming` barrel — `parseSpec(json, manifest)`, `compile(spec, manifest)`, `SHADCN_CAN`.
- Produces: a runnable workspace package `@invariance/tier-a-demo` with `pnpm -F @invariance/tier-a-demo test`.

- [ ] **Step 1: Create the package manifest**

`apps/tier-a-demo/package.json`:
```json
{
  "name": "@invariance/tier-a-demo",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Tier-A governed-theming recorded sales demo (Part 1: mechanism spike, no UI yet).",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@invariance/theming": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create the vitest + ts config**

`apps/tier-a-demo/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
```

`apps/tier-a-demo/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["test", "src"]
}
```

- [ ] **Step 3: Install (wires the workspace package)**

Run: `pnpm install`
Expected: completes; `apps/tier-a-demo/node_modules/@invariance/theming` symlink exists (`apps/*` is already globbed in `pnpm-workspace.yaml`, so no workspace edit is needed).

- [ ] **Step 4: Write the failing smoke test**

`apps/tier-a-demo/test/smoke.test.ts`:
```typescript
import { compile, parseSpec, SHADCN_CAN } from "@invariance/theming";
import { describe, expect, it } from "vitest";

describe("scaffold", () => {
  it("resolves @invariance/theming and compiles the can to a bare HSL triple", () => {
    const parsed = parseSpec({}, SHADCN_CAN);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const theme = compile(parsed.spec, SHADCN_CAN);
    expect(theme.light["--background"]).toMatch(/^-?\d/); // a bare triple, not "#..."
  });
});
```

- [ ] **Step 5: Run the smoke test**

Run: `pnpm -F @invariance/tier-a-demo test`
Expected: PASS (1 test). If `@invariance/theming` fails to resolve, re-run `pnpm install` and confirm the symlink.

- [ ] **Step 6: Commit**

```bash
git add apps/tier-a-demo pnpm-lock.yaml
git commit -m "feat(tier-a-demo): scaffold package for the mechanism spike (no UI)"
```

---

### Task 2: The mechanism probe — measure surface-propagation and seed-role contrast vs AA/AAA

**Files:**
- Test: `apps/tier-a-demo/test/mechanism-probe.test.ts`

**Interfaces:**
- Consumes: `@invariance/theming` — `parseSpec`, `compile`, `verify`, `AppManifest`, `SHADCN_CAN`.
- Produces: confirmed mechanism facts (logged + asserted) that Task 3's decision depends on:
  `surfaceAnchored: boolean`, `midLPrimaryRatio: number`, `midLPrimaryFailsAAAOnly: boolean`,
  and the set of contrast pairs that fail at AA for a saturated `neutral`.

- [ ] **Step 1: Write the probe with an inline WCAG measurer (assertions encode the hypothesis)**

`apps/tier-a-demo/test/mechanism-probe.test.ts`:
```typescript
import { AppManifest, type CandidateTheme, compile, parseSpec, verify } from "@invariance/theming";
import { SHADCN_CAN } from "@invariance/theming";
import { describe, expect, it } from "vitest";

// --- inline WCAG measurement of an emitted bare HSL triple "H S% L%" (product-decision probe;
// --- not an independence check, so reusing standard WCAG math is fine) ---
function hslTripleToSrgb(triple: string): [number, number, number] {
  const [h, s, l] = triple.trim().split(/\s+/).map((t) => parseFloat(t));
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hh = ((h % 360) + 360) % 360;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = L - c / 2;
  let rgb: [number, number, number];
  if (hh < 60) rgb = [c, x, 0];
  else if (hh < 120) rgb = [x, c, 0];
  else if (hh < 180) rgb = [0, c, x];
  else if (hh < 240) rgb = [0, x, c];
  else if (hh < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [rgb[0] + m, rgb[1] + m, rgb[2] + m];
}
function luminance(triple: string): number {
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const [r, g, b] = hslTripleToSrgb(triple).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const la = luminance(a) + 0.05;
  const lb = luminance(b) + 0.05;
  return Math.max(la, lb) / Math.min(la, lb);
}
function lightnessPct(triple: string): number {
  return parseFloat(triple.trim().split(/\s+/)[2]); // the L% token
}

// unlocked, light-only probe manifest so every seed actually moves under compile
const PROBE: AppManifest = AppManifest.parse({
  ...SHADCN_CAN,
  appId: "probe",
  invariants: { ...SHADCN_CAN.invariants, locks: [] },
});

function compileJson(json: unknown): CandidateTheme {
  const p = parseSpec(json, PROBE);
  if (!p.ok) throw new Error(`probe rejected: ${JSON.stringify(p.failures)}`);
  return compile(p.spec, PROBE);
}

describe("MECHANISM PROBE — which seed drives a failing contrast pair, at which tier", () => {
  it("(a) surfaces are profile-ANCHORED: a mid-L neutral keeps --background light", () => {
    const base = compileJson({});
    const midNeutral = compileJson({ colors: { neutral: "oklch(0.55 0.08 300)" } });
    const baseL = lightnessPct(base.light["--background"]);
    const movedL = lightnessPct(midNeutral.light["--background"]);
    // eslint-disable-next-line no-console
    console.log(`[probe a] background L: base=${baseL}% mid-neutral=${movedL}% (anchored ⟹ stays high)`);
    // HYPOTHESIS: anchored — background stays light despite a mid-L neutral.
    // If this FAILS (movedL drops toward ~55), surfaces PROPAGATE and the dramatic full-screen
    // contrast beat is viable — record that; it changes Task 3's decision.
    expect(movedL).toBeGreaterThan(85);
  });

  it("(b) a mid-L seed-role (primary) fails text contrast ONLY at AAA (clears AA ≈4.58, misses 7:1)", () => {
    const t = compileJson({ colors: { primary: "oklch(0.58 0.15 280)" } });
    const ratio = contrast(t.light["--primary-foreground"], t.light["--primary"]);
    const primaryL = lightnessPct(t.light["--primary"]);
    // eslint-disable-next-line no-console
    console.log(`[probe b] mid-L primary: --primary L=${primaryL}% primary-fg/primary contrast=${ratio.toFixed(3)} (AA 4.5 / AAA 7.0)`);
    // HYPOTHESIS: clears AA but fails AAA — so the text-contrast beat is only reachable at AAA.
    expect(ratio).toBeGreaterThanOrEqual(4.5); // clears AA
    expect(ratio).toBeLessThan(7.0); // fails AAA
  });

  it("(c) what a saturated neutral actually fails at AA (expect the ring ui-pair, not a text pair)", () => {
    const t = compileJson({ colors: { neutral: "oklch(0.45 0.18 30)" } });
    const verdict = verify(t, PROBE);
    const failures = verdict.ok ? [] : verdict.failures;
    const summary = failures.map((f) => `${f.code}:${f.pair ? `${f.pair.fg}/${f.pair.bg}(${f.pair.category})` : f.role ?? ""}`);
    // eslint-disable-next-line no-console
    console.log(`[probe c] saturated neutral @AA verdict.ok=${verdict.ok} failures=[${summary.join(", ")}]`);
    // documentary: records WHICH pair carries the only AA contrast story (the weak "ring" one if so).
    // Assert at least that the verdict is decisive (no throw); the failing-pair detail is recorded above.
    expect(typeof verdict.ok).toBe("boolean");
  });
});
```

- [ ] **Step 2: Run the probe and READ the logged measurements**

Run: `pnpm -F @invariance/tier-a-demo test mechanism-probe`
Expected: the `[probe a]`, `[probe b]`, `[probe c]` lines print real numbers. Read them.
- If (a) and (b) PASS → the hypothesis holds: surfaces anchored, seed-role text-contrast reachable only at AAA. Proceed.
- If (a) FAILS (`movedL` dropped) → surfaces propagate; the dramatic full-screen contrast beat is viable. **Record the actual numbers** and adjust the assertion to match reality (e.g. `expect(movedL).toBeLessThan(70)` with a comment), so the test documents the true mechanism.
- If (b) FAILS → re-read the printed ratio and adjust the bounds to the measured truth (e.g. if it clears AAA, the seed-role contrast beat is unreachable too → lock beat is forced). Tune the probe's `primary` oklch L so the test pins the real boundary, with a comment citing the measured value.

> This is a spike: the assertions exist to *lock in the confirmed mechanism as a regression*, not to force a predetermined answer. If reality differs from the hypothesis, change the assertion to match reality and note it — do not change the engine.

- [ ] **Step 3: Re-run until green against reality**

Run: `pnpm -F @invariance/tier-a-demo test mechanism-probe`
Expected: PASS (3 tests), now asserting the *measured* mechanism.

- [ ] **Step 4: Commit**

```bash
git add apps/tier-a-demo/test/mechanism-probe.test.ts
git commit -m "test(tier-a-demo): mechanism probe — surface anchoring + seed-role contrast vs AA/AAA"
```

---

### Task 3: Record findings, make the decision, update the spec

**Files:**
- Create: `apps/tier-a-demo/MECHANISM-FINDINGS.md`
- Modify: `docs/superpowers/specs/2026-06-22-tier-a-customizer-demo-design.md` (§2 beats #4/#8, §4 tier, hero ranking — only as the findings dictate)

**Interfaces:**
- Consumes: the logged measurements from Task 2.
- Produces: a settled decision (the demo's contrast mechanism + tier + hero) that the *next* plan (manifest + CannedAgent + beat-assertions + canvas) builds against.

- [ ] **Step 1: Record the measured findings**

Create `apps/tier-a-demo/MECHANISM-FINDINGS.md` with the actual numbers from Task 2's logs:
```markdown
# Tier-A Demo — Part 1 Mechanism Findings (<date>)

Measured on the real @invariance/theming pipeline (probe manifest = SHADCN_CAN, locks removed):

- **Surface propagation:** background L base = <X>%, under a mid-L neutral = <Y>%.
  → surfaces are [ANCHORED / PROPAGATING].
- **Mid-L seed-role contrast:** mid-L `primary` (oklch 0.58/0.15/280) → primary-fg/primary = <Z>:1.
  → clears AA (<4.5? Y/N>), fails AAA (<7.0? Y/N>).
- **Saturated neutral @ AA:** verify failures = [<codes/pairs>].
  → the only AA contrast story is [the `ring` ui-pair / a text pair / none].

## Decision (three-way)
Chosen: [ contrast-via-surface-at-AAA | contrast-via-primary/accent-at-AAA | lock-led-at-AA ]
Rationale: [does it fire? how dramatic? does blanket-AAA read as contrived to a technical buyer?
whether the lock beat — deterministic, AA-realistic — is the better hero.]
```

- [ ] **Step 2: Present the findings + recommendation and get the decision**

Surface the findings table and a recommendation to the user (the human checkpoint). The decision is a
judgment on **data + buyer-perception**, not just "does the rejection fire":
- If surfaces anchored + seed-role fails only at AAA + blanket-AAA reads as contrived → recommend
  **lock-led at AA** (the `seed_locked` wall rejection as hero — deterministic, credible), with the
  contrast beat either cut or kept as a secondary "even a mid-L brand button can't go illegible at AAA"
  moment only if the user wants AAA.
- If surfaces propagate → recommend **contrast-via-surface-at-AAA** (the dramatic full-screen version).
- Record the user's choice in `MECHANISM-FINDINGS.md`.

- [ ] **Step 3: Update the spec to settled facts**

In `docs/superpowers/specs/2026-06-22-tier-a-customizer-demo-design.md`, rewrite §2 beat #4 (and #8's
phrasing), §4's tier line, and the §2-beat-#5 / hero-ranking text to state the *decided* mechanism,
tier, and hero — removing the PROVISIONAL callout. Keep Appendix A (Plan-08) unchanged.

- [ ] **Step 4: Commit**

```bash
git add apps/tier-a-demo/MECHANISM-FINDINGS.md docs/superpowers/specs/2026-06-22-tier-a-customizer-demo-design.md
git commit -m "docs(tier-a-demo): record mechanism findings + decide contrast/tier/hero; settle the spec"
```

---

## Self-Review

**1. Spec coverage (of §8 Part 1):** the spike's three sub-goals — the mechanism probe (surface-vs-seed-role), the three-way decision, and encoding/settling — map to Tasks 2 and 3; the scaffold (Task 1) is the prerequisite. The *encode the manifest + CannedAgent + beat-assertions* portion of §8-Part-1 is deliberately deferred to the next plan (per the user's "plan Part 1, run it, then plan against settled facts"), and §8 will be re-read when that plan is written. No other spec section is in scope here.

**2. Placeholder scan:** the only intentional blanks are the `<X>/<Y>/<Z>` measurement slots and the bracketed decision in `MECHANISM-FINDINGS.md` — these are *outputs the spike fills at run time*, not plan placeholders; every code step has complete code. No "TBD"/"add error handling"/"similar to" anywhere.

**3. Type consistency:** `compileJson` is defined once per test file where used; `PROBE` is an `AppManifest`; `contrast`/`luminance`/`lightnessPct`/`hslTripleToSrgb` are defined inline in the probe and used only there. `parseSpec`/`compile`/`verify`/`AppManifest`/`SHADCN_CAN` are the real engine barrel exports (confirmed in the interface ledger).

**Note:** Task 3 Steps 2–3 are intentionally judgment/doc steps (no test) — a spike's deliverable is a decision; the reviewer gates the decision and the spec edit. This is the one place "test the deliverable" yields to "record and decide."
