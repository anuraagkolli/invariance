# Tier-A Demo — Part 1: Mechanism Spike (the empirical gate) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empirically determine, on real compiled output, **both halves of "is the contrast beat viable"** — does a rejection fire (and via which seed, at which tier) AND do the scripted *success* beats clear that tier (in *both* modes) — so Task 3 can decide the demo's hero (contrast-at-AA/AAA vs lock) on settled facts, before any UI or manifest tuning is built on an unproven assumption.

**Architecture:** A new, minimal `apps/tier-a-demo` package (TS + vitest, **no UI, no Vite/React yet**) that calls the *real, already-verified* `@invariance/theming` pipeline directly. A probe test measures: (a) whether a mid-lightness `neutral` propagates to surface lightness or surfaces are pinned to the ramp's anchorL; (b) the contrast a *band* of mid-lightness `primary` values produces, vs AA (4.5:1) and AAA (7:1); (c) what a saturated `neutral` actually fails at AA (documentary); and (d) whether the scripted **success** colors (dark indigo, warm surfaces) clear the candidate tier. The output is a **decision**. If the decision is AAA, a conditional Task 4 extends the probe to two modes before settling.

**Tech Stack:** TypeScript (ESM, strict), vitest, `@invariance/theming` (workspace). No new runtime deps; the WCAG measurement helper is inlined in the probe test (the probe measures the engine's output to make a *product* decision — it is not re-verifying the engine).

## Global Constraints

- **Do NOT modify `@invariance/theming` or any engine source.** The demo only *consumes* it.
- **Rejections come from the real engine**, never faked — this plan asserts engine behavior directly.
- **This part ships NO UI and adds no Vite/React.** vitest `environment: "node"`.
- **Measure first, pin second.** Probe steps LOG measurements and are read by a human *before* any
  threshold assertion is written. Assertions pin the *discovered* numbers as a regression — they must
  never be made green by tuning the input until it matches a hypothesis. If reality contradicts a
  hypothesis, record the real number; never edit the engine.
- **This is a SPIKE: its deliverable is a DECISION that may revise the spec** (`docs/superpowers/specs/2026-06-22-tier-a-customizer-demo-design.md` §2 beats #4/#8, §4 tier, hero ranking). The demo manifest, CannedAgent, beat-assertion tests, and all UI are **out of scope** and planned in the next part against the settled facts.
- **Asymmetric dark-mode gate:** a **lock-led-AA** decision is fully de-risked by the light-only probe (the `seed_locked` wall rejection is mode-independent; AA success clearance ≈ 4.58 ≥ 4.5 holds in both modes). An **AAA** decision is NOT — it must pass the two-mode Task 4 before being settled.
- **Execution isolation:** start by branching off `governed-customization-redesign` (or a worktree via `superpowers:using-git-worktrees`) — do NOT build on the `verify/engine` branch.
- Engine facts (from `docs/verify/2026-06-21-engine-verification.md` — the hypothesis to confirm/refute): every foreground is `foreground-of(…, "maximize-contrast")` and **runs to the achromatic extreme regardless of tier** (the repair loop is only a safety net), worst case ≈ **4.58:1**; `background`'s L was found **profile-anchored**; `primary`/`accent`/`destructive` are `{kind:"seed"}` (role L = seed L); dark mode is **mode-polarized** (a per-mode `seedNudge` can shift a seed's L). `SHADCN_CAN` is light-only, locks `["primary"]`, tier AA, chromaCap 0.3. `VerifyFailure` shape (ledger §6.1): `{ code, mode, pair?: {fg,bg,category}, role?, varName?, required?, actual?, message }`.

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

### Task 2: The mechanism probe — measure (then pin) surface-propagation, the failing band, and success clearance

**Files:**
- Create: `apps/tier-a-demo/test/_measure.ts` (the inline WCAG helper, shared by Task 2 and a possible Task 4)
- Test: `apps/tier-a-demo/test/mechanism-probe.test.ts`

**Interfaces:**
- Consumes: `@invariance/theming` — `parseSpec`, `compile`, `verify`, `AppManifest`, `SHADCN_CAN`.
- Produces: confirmed facts (logged, then pinned) that Task 3's decision depends on — surface anchoring, the mid-L `primary` failing band vs AA/AAA, the AA contrast-failure pair, and whether the dark-indigo success color clears the candidate tier (light).

- [ ] **Step 1: Write the WCAG measurement helper**

`apps/tier-a-demo/test/_measure.ts`:
```typescript
// Inline WCAG measurement of an emitted bare HSL triple "H S% L%". This probe measures the engine's
// output to make a PRODUCT decision; it is not an independence check, so standard WCAG math is fine.
export function hslTripleToSrgb(triple: string): [number, number, number] {
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
export function luminance(triple: string): number {
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const [r, g, b] = hslTripleToSrgb(triple).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const la = luminance(a) + 0.05;
  const lb = luminance(b) + 0.05;
  return Math.max(la, lb) / Math.min(la, lb);
}
export function lightnessPct(triple: string): number {
  return parseFloat(triple.trim().split(/\s+/)[2]); // the L% token
}
```

- [ ] **Step 2: Write the probe as MEASUREMENTS ONLY (logs, no threshold assertions yet)**

`apps/tier-a-demo/test/mechanism-probe.test.ts`:
```typescript
import { AppManifest, type CandidateTheme, compile, parseSpec, SHADCN_CAN, verify } from "@invariance/theming";
import { describe, expect, it } from "vitest";
import { contrast, lightnessPct } from "./_measure.js";

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
/* eslint-disable no-console */

describe("MECHANISM PROBE — measurements (read these, then pin in Step 4)", () => {
  it("(a) surface propagation: does a mid-L neutral move --background L?", () => {
    const baseL = lightnessPct(compileJson({}).light["--background"]);
    const movedL = lightnessPct(compileJson({ colors: { neutral: "oklch(0.55 0.08 300)" } }).light["--background"]);
    console.log(`[a] background L: base=${baseL}% mid-neutral=${movedL}% → ${movedL > 85 ? "ANCHORED" : "PROPAGATES"}`);
    expect(typeof movedL).toBe("number");
  });

  it("(b) failing band: mid-L primary → primary-fg/primary contrast across an L sweep", () => {
    for (const L of [0.45, 0.5, 0.55, 0.6, 0.65]) {
      const t = compileJson({ colors: { primary: `oklch(${L} 0.15 280)` } });
      const r = contrast(t.light["--primary-foreground"], t.light["--primary"]);
      console.log(`[b] primary oklchL=${L} → emittedL=${lightnessPct(t.light["--primary"])}% contrast=${r.toFixed(3)} (AA≥4.5 ${r >= 4.5 ? "Y" : "N"} / AAA≥7 ${r >= 7 ? "Y" : "N"})`);
    }
    expect(true).toBe(true);
  });

  it("(c) saturated neutral @ AA: which pair fails (documentary)", () => {
    const verdict = verify(compileJson({ colors: { neutral: "oklch(0.45 0.18 30)" } }), PROBE);
    const fails = verdict.ok ? [] : verdict.failures.map((f) => `${f.code}:${f.pair ? `${f.pair.fg}/${f.pair.bg}(${f.pair.category})` : f.role ?? ""}`);
    console.log(`[c] saturated neutral @AA ok=${verdict.ok} fails=[${fails.join(", ")}]`);
    expect(typeof verdict.ok).toBe("boolean");
  });

  it("(d) SUCCESS clearance (tier-independent): scripted success colors → their key pair contrast", () => {
    // beat #2 dark indigo primary; the value MUST clear the chosen tier (≥7 for AAA viability).
    const indigo = compileJson({ colors: { primary: "oklch(0.35 0.12 270)" } });
    const indigoR = contrast(indigo.light["--primary-foreground"], indigo.light["--primary"]);
    console.log(`[d] dark-indigo primary → primary-fg/primary=${indigoR.toFixed(3)} (AAA≥7 ${indigoR >= 7 ? "Y" : "N"})`);
    // beat #3 warm light surfaces are anchored-light (probe a) → foreground-of(light) clears trivially;
    // measure to confirm, not assume:
    const warm = compileJson({ colors: { neutral: "oklch(0.95 0.03 60)" } });
    const warmR = contrast(warm.light["--foreground"], warm.light["--background"]);
    console.log(`[d] warm-light surfaces → foreground/background=${warmR.toFixed(3)} (AAA≥7 ${warmR >= 7 ? "Y" : "N"})`);
    expect(typeof indigoR).toBe("number");
  });
});
```

- [ ] **Step 3: Run the probe and READ every logged line**

Run: `pnpm -F @invariance/tier-a-demo test mechanism-probe`
Expected: 4 tests PASS; the `[a]`–`[d]` lines print real numbers. Record them (they feed Task 3 and `MECHANISM-FINDINGS.md`). Do not proceed until you have read and noted:
- (a) ANCHORED or PROPAGATES, with the two L values.
- (b) for which oklchL the `primary-fg/primary` contrast falls in `[4.5, 7.0)` — the failing-AAA band.
- (c) the exact pair(s) that fail at AA (likely the `ring` ui-pair — the weak story).
- (d) whether dark-indigo clears 7 (AAA-viable success) and the warm-surfaces ratio.

- [ ] **Step 4: PIN the discovered numbers as regression assertions**

Edit `mechanism-probe.test.ts`: replace each `expect(typeof …).toBe(...)` / `expect(true)` placeholder with an
assertion that pins the *measured* reality (not a hypothesis). Examples — use YOUR measured values:
```typescript
// (a) if measured ANCHORED (movedL stayed ~base):
expect(movedL).toBeGreaterThan(85);
// (a) if measured PROPAGATES instead, pin that truth and note it:
// expect(movedL).toBeLessThan(70); // surfaces propagate — full-screen contrast beat is viable

// (b) pin the failing sub-band you observed, e.g. if 0.5–0.6 fail AAA but clear AA:
//   inside the loop, for the L values you saw fail:
expect(r, `primary L=${L}`).toBeLessThan(7.0);   // fails AAA
expect(r, `primary L=${L}`).toBeGreaterThanOrEqual(4.5); // clears AA

// (d) pin success clearance for the indigo you'll actually script:
expect(indigoR).toBeGreaterThanOrEqual(7.0); // dark indigo clears AAA in light
```
(c) stays documentary (no threshold assertion — it records which pair carries the AA story).

- [ ] **Step 5: Re-run green and commit**

Run: `pnpm -F @invariance/tier-a-demo test mechanism-probe`
Expected: PASS, now pinning the measured mechanism.
```bash
git add apps/tier-a-demo/test/_measure.ts apps/tier-a-demo/test/mechanism-probe.test.ts
git commit -m "test(tier-a-demo): mechanism probe — anchoring, failing band, AA pair, success clearance (light)"
```

---

### Task 3: Record findings, make the decision; settle the spec OR route to Task 4

**Files:**
- Create: `apps/tier-a-demo/MECHANISM-FINDINGS.md`
- Modify: `docs/superpowers/specs/2026-06-22-tier-a-customizer-demo-design.md` (only as the findings dictate)

**Interfaces:**
- Consumes: Task 2's measurements.
- Produces: either a SETTLED decision (lock-led-AA) with the spec updated, OR a decision to pursue AAA that **gates on Task 4** before the spec is settled.

- [ ] **Step 1: Record the measured findings**

Create `apps/tier-a-demo/MECHANISM-FINDINGS.md` with the actual numbers from Task 2:
```markdown
# Tier-A Demo — Part 1 Mechanism Findings (<date>)

Measured on the real @invariance/theming pipeline (probe manifest = SHADCN_CAN, locks removed):

- Surface propagation: background L base=<X>% / mid-neutral=<Y>% → [ANCHORED / PROPAGATES].
- Mid-L primary failing band: contrast falls in [4.5,7.0) for oklchL ∈ <list>; the AAA-failing band is <range>.
- Saturated neutral @AA fails: [<codes/pairs>] → the AA contrast story is [ring ui-pair / a text pair / none].
- Success clearance (light): dark-indigo primary-fg/primary=<Z>:1 (clears AAA: <Y/N>); warm surfaces=<W>:1.

## Decision (three-way)
Chosen: [ contrast-via-surface-at-AAA | contrast-via-primary/accent-at-AAA | lock-led-at-AA ]
Rationale: [fires? dramatic? does blanket-AAA read as contrived to a technical buyer? is the lock —
deterministic, mode-independent, AA-realistic — the better hero?]
Dark-mode gate: [N/A for lock-led-AA | REQUIRED → Task 4 (AAA only)]
```

- [ ] **Step 2: Present findings + recommendation; get the decision**

Surface the findings table + recommendation to the user (human checkpoint). The decision is a judgment
on **data + buyer-perception**, not just "does the rejection fire":
- Surfaces anchored + seed-role fails only at AAA + blanket-AAA reads as contrived → recommend
  **lock-led-AA** (the `seed_locked` wall rejection as hero — deterministic, credible).
- Surfaces propagate → **contrast-via-surface-at-AAA** is viable (dramatic) → still AAA → Task 4.
- User wants the visceral contrast hero and accepts AAA → **AAA path** → Task 4.
Record the choice + rationale in `MECHANISM-FINDINGS.md`.

- [ ] **Step 3: Branch on the decision**
  - **If lock-led-AA (no AAA):** the light-only probe is sufficient. Go to Step 4 (settle the spec).
  - **If any AAA path:** **STOP — do NOT settle the spec yet.** Do Task 4 first; settle only after it
    confirms AAA is viable in both modes (or forces a fall back to lock-led-AA).

- [ ] **Step 4: Settle the spec (after lock-led-AA, or after Task 4 confirms AAA)**

In `docs/superpowers/specs/2026-06-22-tier-a-customizer-demo-design.md`, rewrite §2 beat #4 (+ #8's
phrasing), §4's tier line, and the §2-beat-#5 / hero-ranking text to the *decided* mechanism, tier, and
hero — removing the PROVISIONAL callout. Keep Appendix A (Plan-08) unchanged.
```bash
git add apps/tier-a-demo/MECHANISM-FINDINGS.md docs/superpowers/specs/2026-06-22-tier-a-customizer-demo-design.md
git commit -m "docs(tier-a-demo): record mechanism findings + decision; settle the spec"
```

---

### Task 4 (CONDITIONAL — only if Task 3 chose an AAA path): two-mode AAA viability gate

> Skip entirely if the decision is lock-led-AA. This task de-risks AAA's hard half: the success beats
> must clear 7:1 in **both** modes, and an AAA dark base must be **constructible** at all.

**Files:**
- Test: `apps/tier-a-demo/test/aaa-two-mode-probe.test.ts`

**Interfaces:**
- Consumes: `@invariance/theming` — `AppManifest`, `parseSpec`, `compile`, `verify`, `SHADCN_CAN`; `./_measure.js`.
- Produces: a yes/no on AAA viability in both modes; either confirms AAA (Task 3 Step 4 proceeds) or forces the fall back to lock-led-AA (return to Task 3 Step 2 with that finding).

- [ ] **Step 1: Construct a candidate AAA two-mode manifest and probe constructibility**

`apps/tier-a-demo/test/aaa-two-mode-probe.test.ts`:
```typescript
import { AppManifest, type CandidateTheme, compile, parseSpec, SHADCN_CAN, verify } from "@invariance/theming";
import { describe, expect, it } from "vitest";
import { contrast } from "./_measure.js";
/* eslint-disable no-console */

// A candidate AAA base in BOTH modes. refBasePassesTier (a superRefine) will THROW on AppManifest.parse
// if any pair fails 7:1 in either mode — so this step also probes "is an AAA dark base constructible".
// Start from the standard shadcn dark base and raise contrast where AAA demands (e.g. destructive,
// muted-fg); iterate the values until parse() succeeds, recording what had to change.
const AAA_LIGHT: Record<string, string> = { /* fill from SHADCN_CAN.base.light, raised to clear 7:1 */ };
const AAA_DARK: Record<string, string> = { /* a dark base raised to clear 7:1 */ };

it("AAA base is constructible in both modes (refBasePassesTier accepts it)", () => {
  let parsed: AppManifest | null = null;
  try {
    parsed = AppManifest.parse({
      ...SHADCN_CAN,
      appId: "probe-aaa",
      modes: { allowed: ["light", "dark"], default: "light", selectors: { light: ":root", dark: ".dark" } },
      base: { light: AAA_LIGHT, dark: AAA_DARK },
      invariants: { ...SHADCN_CAN.invariants, contrastTier: "AAA", locks: [] },
    });
  } catch (e) {
    console.log(`[aaa] base NOT constructible at AAA: ${(e as Error).message}`);
  }
  // If this fails repeatedly, AAA is impractical for the demo → report and fall back to lock-led-AA.
  expect(parsed, "could not build an AAA-passing base — fall back to lock-led-AA").not.toBeNull();
});
```
Iterate `AAA_LIGHT`/`AAA_DARK` until `parse()` succeeds (run the test, read the thrown failing pair from
the log, raise that pair's contrast, repeat). Record in `MECHANISM-FINDINGS.md` what had to change — if
it proves impractical, that itself is the finding: **fall back to lock-led-AA**.

- [ ] **Step 2: Confirm the scripted SUCCESS colors clear 7:1 in BOTH modes**

Append to the same file (using the constructed AAA manifest, `M`):
```typescript
it("scripted success beats clear AAA in light AND dark (dark is mode-polarized)", () => {
  const M = AppManifest.parse({ /* the AAA manifest from Step 1 */ } as never);
  const p = parseSpec({ colors: { primary: "oklch(0.35 0.12 270)" } }, M); // beat #2 dark indigo
  expect(p.ok).toBe(true);
  if (!p.ok) return;
  const t: CandidateTheme = compile(p.spec, M);
  const verdict = verify(t, M);
  const light = contrast(t.light["--primary-foreground"], t.light["--primary"]);
  const dark = t.dark ? contrast(t.dark["--primary-foreground"], t.dark["--primary"]) : NaN;
  console.log(`[aaa] indigo primary-fg/primary light=${light.toFixed(3)} dark=${dark.toFixed(3)} verdict.ok=${verdict.ok}`);
  // The whole point: the happy path must NOT be rejected, in either mode.
  expect(verdict.ok, "scripted success beat must verify (clear AAA) in both modes").toBe(true);
});
```
If `verdict.ok` is false (the dark `seedNudge` dragged the indigo mid-L so dark fails AAA), the success
beat breaks in the climax view → either pick a darker/lighter indigo that clears AAA in both modes
(re-measure), or **fall back to lock-led-AA**. Record the outcome.

- [ ] **Step 3: Commit and return to Task 3 Step 4 with the verdict**

```bash
git add apps/tier-a-demo/test/aaa-two-mode-probe.test.ts apps/tier-a-demo/MECHANISM-FINDINGS.md
git commit -m "test(tier-a-demo): AAA two-mode viability gate (base constructibility + both-mode success clearance)"
```
Then resume Task 3 Step 4: settle the spec to AAA (if confirmed) or to lock-led-AA (if AAA proved
unviable).

---

## Self-Review

**1. Spec coverage (of §8 Part 1):** the spike now covers BOTH halves of "is the contrast beat viable" —
the rejection mechanism (Task 2 a/b/c) AND success-beat clearance (Task 2 d + Task 4 for AAA's dark
mode) — plus the three-way decision and spec-settling (Task 3); scaffold (Task 1) is the prerequisite.
The *encode the manifest + CannedAgent + beat-assertions* and all UI portions of §8 are deliberately
deferred to the next plan (per "plan Part 1, run it, then plan against settled facts").

**2. Placeholder scan:** the `<X>/<Y>/<Z>` slots in `MECHANISM-FINDINGS.md` and the `AAA_LIGHT`/
`AAA_DARK` record literals are *spike outputs filled at run time* (the spike's entire job is to discover
them), not plan placeholders. Every executable step has complete code; Task 4 explicitly instructs the
iterate-until-parse loop rather than hand-waving "fill in the base."

**3. Type consistency:** `_measure.ts` exports `hslTripleToSrgb/luminance/contrast/lightnessPct`, used
by Tasks 2 and 4. `PROBE`/`M` are `AppManifest`; `compileJson` returns `CandidateTheme`. Engine barrel
exports (`parseSpec/compile/verify/AppManifest/SHADCN_CAN`) and the `VerifyFailure` field names
(`f.code/f.pair?.fg/f.pair?.bg/f.pair?.category/f.role`) match the ledger §6.1 and the verification
suite that exercised them.

**Note:** Task 3 Steps 2–3 and Task 4's iterate-until-parse are judgment/exploration steps (a spike's
deliverable is a decision); the reviewer gates the decision and the spec edit. This is the one place
"test the deliverable" yields to "measure, decide, record."
