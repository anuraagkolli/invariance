# Tier-A Demo — Part 5: Two-Tenant Side-by-Side Climax — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The finale — two tenants (Acme indigo/rounded, Globex emerald/sharp) themed side-by-side from the **same** AA manifest, each driven by its **own independent session**, with **one shared light/dark toggle** flipping both, proven in chromium to show different themed colors simultaneously and swap together — plus the recording-reliability polish that is the whole point of a demo.

**Architecture:** No new engine extraction. A `SideBySideView` instantiates **two** `useDemoSession(agent, DEMO_MANIFEST, tenant)` (Acme, Globex) — the per-tenant keying carried since Part 4 — each rendering its own scoped wrapper + `AnalyticsDashboard`. A single shared `mode` lives at the side-by-side level (not per-session) and is applied to both wrappers. Globex's brand is a validated canned turn (run through the real engine like Acme's). The App gains a Studio ↔ Side-by-side view switch. Smooth CSS transitions + one-click prompts make the take clean.

**Tech Stack:** React 18, Vite, Tailwind v3, vitest (node + chromium), `@invariance/theming`.

## Global Constraints

- **Tenant-scoped from line 1.** Every assertion and every preview selector is per-tenant
  (`[data-testid="scope-acme"]` / `"scope-globex"`, `cta-acme` / `cta-globex`). No singular "the
  preview"/"the session"/"the applied theme" — that assumption is what went stale in Parts 3→4.
- **Two genuinely independent sessions.** Two `useDemoSession` instances; the `CannedAgent` is
  stateless (prompt-keyed, no cursor) so it's safe to share or per-tenant. **Isolation is a tested
  property**, not an assumption: mutating one tenant (incl. a rejected turn) leaves the other's
  session/draft/applied byte-unchanged. This is the demo-scale form of the product's
  one-tenant-can't-observe-another invariant.
- **Wrapper-scoping must hold with two wrappers on one page.** Each wrapper redefines the same `--*`
  names on *itself*; neither may leak to `:root`, and `.dark` lands on the wrapper, not the document.
  The chromium proof: Acme's CTA and Globex's CTA show **different** themed colors **simultaneously**.
- **One shared dark toggle** flips both tenants together (the climax beat: "both brands hold
  accessibility in dark"). `mode` is side-by-side-level state, not per-session.
- **Same governance, different brand.** Both tenants use the **same `DEMO_MANIFEST`** (AA, destructive
  locked). Globex's emerald/sharp brand is validated through the real engine (Part-2 style) — the
  side-by-side proves "two brands, one set of invariants," not "two themes we eyeballed."
- **Recording reliability is real scope:** one-click example prompts (no live typing), the
  deterministic `CannedAgent` (no qwen), smooth re-theme transitions (not snapping), and a clean view
  switch so the narrative runs without fumbling.
- **Standing rule (from Part 4):** any future extraction onto `@invariance/theming/authoring` uses
  **named** re-exports across the control-plane seam, never blanket `export *` (duplicated names get
  silently dropped). N/A this part (no extraction) — recorded so it doesn't recur.
- **Branch:** `tier-a-demo`. Testing §7-light: the two NEW things (session isolation, two-wrapper
  scoping) get real tests; the climax otherwise smoke-checks that it renders without throwing.

---

### Task 1: Globex's brand — validated through the real engine

**Files:**
- Modify: `apps/tier-a-demo/src/demo/script.ts` (add `GLOBEX_SCRIPT`)
- Test: `apps/tier-a-demo/test/globex-brand.test.ts`

**Interfaces:**
- Produces: `export const GLOBEX_SCRIPT: Record<string, CannedTurn>` — Globex's emerald/sharp brand prompt(s), and a test proving the brand turn is an accepted `diff` that verifies AA in both modes.

- [ ] **Step 1: Add Globex's canned brand**

In `script.ts`, add (the existing `SCRIPT` stays Acme's):
```typescript
export const GLOBEX_SCRIPT: Record<string, CannedTurn> = {
  "Match Globex — emerald, crisp corners.": {
    classification: "in_scope_styling",
    spec: { colors: { primary: "oklch(0.5 0.13 160)", accent: "oklch(0.68 0.1 160)" }, radius: 2 },
  },
};
```

- [ ] **Step 2: Validate the brand verifies AA (Part-2 style) — write + run**

`test/globex-brand.test.ts` (node): drive the Globex brand prompt through `runScriptedTurn(new CannedAgent(GLOBEX_SCRIPT), fresh, prompt, DEMO_MANIFEST)` → assert `kind === "diff"` (accepted, clears AA in both modes — an accepted diff means verify passed every allowed mode), the diff touches `primary`, and the emitted primary differs from Acme's indigo (genuinely contrasting). If it does NOT verify, retune the emerald oklch within the AA-clearing range (measure-first) and update `GLOBEX_SCRIPT` — never weaken the assertion.
Run → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/tier-a-demo/src/demo/script.ts apps/tier-a-demo/test/globex-brand.test.ts
git commit -m "feat(tier-a-demo): Globex brand (emerald/sharp), validated AA through the real engine"
```

---

### Task 2: Session isolation — the multi-tenant property at demo scale

**Files:**
- Test: `apps/tier-a-demo/test/session-isolation.test.ts`

**Interfaces:**
- Consumes: the pure reducers (`initialState`, `submitState`, `ackState`) + `CannedAgent` + the two scripts.
- Produces: the proof that two tenants' sessions never share state.

- [ ] **Step 1: Write the isolation test (mutate one, assert the other byte-unchanged)**

`test/session-isolation.test.ts` (node):
```typescript
import { describe, expect, it } from "vitest";
import { CannedAgent } from "../src/demo/canned-agent.js";
import { SCRIPT, GLOBEX_SCRIPT } from "../src/demo/script.js";
import { DEMO_MANIFEST } from "../src/demo/manifest.js";
import { ackState, initialState, submitState } from "../src/studio/session-state.js";

const acmeAgent = new CannedAgent(SCRIPT);
const globexAgent = new CannedAgent(GLOBEX_SCRIPT);
const INDIGO = "Make it feel like Acme — deep indigo, a little more rounded.";
const ERROR = "Recolor the error state to a friendly green.";
const snap = (s: unknown) => JSON.stringify(s);

describe("two-tenant session isolation (one tenant can't observe another)", () => {
  it("customizing Acme leaves Globex's session/draft/applied byte-unchanged", async () => {
    let acme = initialState(DEMO_MANIFEST, "acme");
    const globex = initialState(DEMO_MANIFEST, "globex");
    const globexBefore = snap(globex);

    acme = ackState(await submitState(acme, acmeAgent, INDIGO, DEMO_MANIFEST)); // mutate Acme
    expect(acme.session.draft.colors?.primary).toBeDefined();
    expect(snap(globex)).toBe(globexBefore); // Globex untouched (separate value, no shared mutable)
  });

  it("a REJECTED turn on Acme also leaves Globex byte-unchanged", async () => {
    let acme = ackState(await submitState(initialState(DEMO_MANIFEST, "acme"), acmeAgent, INDIGO, DEMO_MANIFEST));
    const globex = ackState(await submitState(initialState(DEMO_MANIFEST, "globex"), globexAgent, "Match Globex — emerald, crisp corners.", DEMO_MANIFEST));
    const globexBefore = snap(globex);
    const acmeAppliedBefore = acme.applied;

    acme = await submitState(acme, acmeAgent, ERROR, DEMO_MANIFEST); // Acme rejection
    expect(acme.outcome?.kind).toBe("rejected");
    expect(acme.applied).toBe(acmeAppliedBefore); // Acme's own preview held
    expect(snap(globex)).toBe(globexBefore); // …and Globex entirely untouched
  });

  it("and symmetrically: customizing Globex leaves Acme byte-unchanged", async () => {
    const acme = initialState(DEMO_MANIFEST, "acme");
    const acmeBefore = snap(acme);
    await submitState(initialState(DEMO_MANIFEST, "globex"), globexAgent, "Match Globex — emerald, crisp corners.", DEMO_MANIFEST);
    expect(snap(acme)).toBe(acmeBefore);
  });
});
```
Run → PASS. (Pure reducers return new values; this proves no accidental shared mutable — the property the side-by-side UI rests on.)

- [ ] **Step 2: Commit**

```bash
git add apps/tier-a-demo/test/session-isolation.test.ts
git commit -m "test(tier-a-demo): two-tenant session isolation — mutating one leaves the other byte-unchanged"
```

---

### Task 3: `SideBySideView` + shared dark toggle + smooth transitions + view switch

**Files:**
- Create: `apps/tier-a-demo/src/studio/StudioView.tsx` (the Part-4 single-tenant studio, extracted from `App.tsx`)
- Create: `apps/tier-a-demo/src/studio/TenantColumn.tsx`, `apps/tier-a-demo/src/studio/SideBySideView.tsx`
- Modify: `apps/tier-a-demo/src/App.tsx` (view switch), `apps/tier-a-demo/src/index.css` (transitions)

**Interfaces:**
- `TenantColumn({ tenant, agent, brandPrompt, examples, mode })` — one `useDemoSession`, pre-applies `brandPrompt` on mount, renders a labelled wrapper (`data-testid="scope-{tenant}"`, CTA `cta-{tenant}`) + one-click example buttons; `applyScoped(wrapper, state.applied, mode)` uses the SHARED `mode` prop.
- `SideBySideView()` — holds the shared `const [mode, setMode]`, renders one dark toggle (`data-testid="shared-toggle"`) + two `TenantColumn`s (Acme, Globex).

- [ ] **Step 1: Extract the Part-4 studio into `StudioView`**

Move `App.tsx`'s current body into `StudioView.tsx` (unchanged behavior). Verify the existing studio tests/build still pass.

- [ ] **Step 2: `TenantColumn` (per-tenant session, shared mode)**

`TenantColumn.tsx`: `const demo = useDemoSession(agent, DEMO_MANIFEST, tenant)`. `useEffect(() => { demo.submit(brandPrompt) }, [])` then auto-acknowledge once it diffs (a small effect, or a one-shot helper that submits+acks the brand) so the column shows its brand. `useEffect(() => applyScoped(wrapperRef.current!, demo.state.applied, mode), [demo.state.applied, mode])` — **note `mode` is the prop, not `demo.state.mode`**. Render: a tenant label, the example-prompt buttons (`PromptBox` with `examples`, `onSubmit=demo.submit` — live-customizable independently), and `<div ref data-testid={"scope-"+tenant}><AnalyticsDashboard/></div>` with the CTA inside carrying `data-testid={"cta-"+tenant}` (pass a `ctaTestId` prop to the dashboard, or wrap). Keep it compact (no full OutcomePanel — the Studio view is the full customizer; this is the climax).

- [ ] **Step 3: `SideBySideView` (shared toggle)**

`SideBySideView.tsx`: `const [mode, setMode] = useState<"light"|"dark">("light")`. A header with one `<button data-testid="shared-toggle" onClick={() => setMode(m => m==="light"?"dark":"light")}>Both: {mode}</button>`. Two `TenantColumn`s: Acme (`agent=new CannedAgent(SCRIPT)`, brandPrompt=the indigo prompt, examples=SCRIPT keys), Globex (`agent=new CannedAgent(GLOBEX_SCRIPT)`, brandPrompt=the emerald prompt, examples=GLOBEX_SCRIPT keys), both passed `mode`.

- [ ] **Step 4: App view switch + smooth transitions**

`App.tsx`: `const [view, setView] = useState<"studio"|"side">("studio")`; a header with `data-testid="view-studio"` / `data-testid="view-side"` buttons; render `<StudioView/>` or `<SideBySideView/>`. In `index.css`, add smooth re-theme transitions scoped to the previews:
```css
[data-testid^="scope"] * { transition: background-color .3s ease, color .3s ease, border-color .3s ease; }
```
Run `pnpm -F @invariance/tier-a-demo build` → succeeds; `typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/tier-a-demo/src/studio/StudioView.tsx apps/tier-a-demo/src/studio/TenantColumn.tsx apps/tier-a-demo/src/studio/SideBySideView.tsx apps/tier-a-demo/src/App.tsx apps/tier-a-demo/src/index.css
git commit -m "feat(tier-a-demo): two-tenant side-by-side climax — per-tenant sessions, shared dark toggle, view switch, smooth transitions"
```

---

### Task 4: chromium — two-wrapper scoping + on-page isolation + climax smoke

**Files:**
- Test: `apps/tier-a-demo/test/sidebyside.chromium.test.ts`

**Interfaces:**
- Consumes: the real App via a Vite dev server (Part-3/4 harness); the two scripts, `DEMO_MANIFEST`, `compile`/`parseSpec`, `hslTripleToSrgb`.

- [ ] **Step 1: Write the e2e (tenant-scoped from line 1)**

`sidebyside.chromium.test.ts`: dev-server + chromium. Navigate, click `[data-testid="view-side"]`, wait for both `[data-testid="scope-acme"]` and `[data-testid="scope-globex"]` to be themed (their brands auto-applied). Then assert, with **independently-derived** expected RGBs (compile each brand spec in node):
  1. **Two wrappers, no bleed:** `getComputedStyle(cta-acme).backgroundColor` equals Acme's themed indigo AND `cta-globex` equals Globex's themed emerald — **simultaneously, different colors** (`!close(acme, globex)`). This only holds if `applyScoped` is genuinely wrapper-scoped.
  2. **Shared toggle swaps both:** click `[data-testid="shared-toggle"]` → both CTAs become their respective **dark** themed primaries (each compiled `.dark["--primary"]`), and each differs from its own light value.
  3. **On-page isolation:** in light, capture `cta-globex`; click an Acme example prompt (changes Acme); `waitForFunction` `cta-acme` changed; assert `cta-globex` is **unchanged** (customizing one tenant doesn't touch the other — the visual form of Task 2).
Plus a smoke: the side-by-side mounts without throwing (both dashboards present).

- [ ] **Step 2: Run + full suite + commit**

`pnpm -F @invariance/tier-a-demo test` → all green; `typecheck` clean.
```bash
git add apps/tier-a-demo/test/sidebyside.chromium.test.ts
git commit -m "test(tier-a-demo): chromium — two wrappers themed independently (no bleed), shared toggle swaps both, on-page isolation"
```

---

## Self-Review

**1. Spec coverage (§8 Part 4 + the spec's beat #8 climax):** the two-tenant side-by-side (Tasks 3–4), the shared light/dark toggle (Task 3, proven in Task 4), Globex as a validated contrasting brand under the same manifest (Task 1), session isolation (Task 2), and recording polish — one-click prompts, deterministic agent, smooth transitions, the view switch (Task 3). This completes the demo per §2's narrative (studio customize → side-by-side climax).

**2. Placeholder scan:** the isolation test is given in full; `TenantColumn`/`SideBySideView` by exact props + per-tenant `data-testid`s + the shared-`mode` wiring; the Globex brand is concrete (retune-if-needed is a measure-first guard, not a placeholder). No "TBD".

**3. Type consistency:** `useDemoSession(agent, DEMO_MANIFEST, tenant)` per column; `applyScoped(wrapper, state.applied, mode)` uses the shared `mode` prop (NOT `state.mode`). `GLOBEX_SCRIPT`/`SCRIPT` are `Record<string, CannedTurn>`. CTAs carry `cta-{tenant}` ids; wrappers `scope-{tenant}`.

**Two places to look hardest (flagged for review):** (a) Task 2's isolation assertion — it must mutate one tenant *including a rejected turn* and prove the other is byte-identical (not just "both render"); (b) Task 4's two-wrapper cascade — the two CTAs must differ *simultaneously* and both swap on the shared toggle, which is the assertion that catches a `:root` leak a single-wrapper test can't see.

**Note (recording polish as scope):** Task 3 delivers one-click examples (no typing), the deterministic CannedAgent (no qwen), CSS transitions (smooth, not snapping), and the Studio↔Side-by-side switch. An optional stretch (not required): a "guided steps" driver that plays the narrative beats in sequence — deferred unless the recording needs it.
