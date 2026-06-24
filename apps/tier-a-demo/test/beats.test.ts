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
  expect(gate.classification, prompt).toBe("in_scope_styling"); // all demo prompts are in scope
  const designed = await agent.design({ prompt, draft: session.draft, envelope });
  return runTurn(session, designed.specJson, DEMO_MANIFEST);
}
const fresh = (): Session => ({ tenant: "stripe", draft: APP_DEFAULT_SPEC, published: null });
function compileNeutral(neutral: string): CandidateTheme {
  const p = parseSpec({ colors: { neutral } }, DEMO_MANIFEST);
  if (!p.ok) throw new Error(`rejected: ${JSON.stringify(p.failures)}`);
  return compile(p.spec, DEMO_MANIFEST);
}

const STRIPE = "Make it match Stripe.";
const SOFTEN = "Soften the corners.";
const SATURATED = "Make the surfaces a bold, saturated orange.";
const COMPACT = "Cram everything in — make it compact.";
const RECOLOR_ERROR = "Recolor the error state to a friendly green.";

describe("scripted beats fire their intended engine outcome (the governance proof)", () => {
  it("beat #1 (Stripe jaw-drop) → accepted diff, with a populated dark var set", async () => {
    const t = await driveBeat(fresh(), STRIPE);
    expect(t.kind).toBe("diff");
    if (t.kind !== "diff") return;
    expect(t.diff.some((d) => d.role === "primary")).toBe(true);
    // both-mode proof: an accepted diff already means verify passed every allowed mode; assert dark is
    // actually emitted so a future change that drops dark from the manifest fails loudly here.
    expect(t.candidate.dark && Object.keys(t.candidate.dark).length > 0).toBe(true);
  });

  it("beat #2 (soften corners) → accepted diff touching nothing that fails governance", async () => {
    const t = await driveBeat(fresh(), SOFTEN);
    expect(t.kind).toBe("diff");
  });

  it("beat #3 (saturated surfaces) → SECONDARY: contrast_floor on muted-fg", async () => {
    const t = await driveBeat(fresh(), SATURATED);
    expect(t.kind).toBe("rejected");
    if (t.kind !== "rejected") return;
    expect(t.failures.some((f) => "code" in f && f.code === "contrast_floor")).toBe(true);
    expect(t.failures.some((f) => "pair" in f && f.pair?.fg === "muted-fg")).toBe(true);
  });

  it("beat #4 (compact density) → NEW beat: target_size_floor", async () => {
    const t = await driveBeat(fresh(), COMPACT);
    expect(t.kind).toBe("rejected");
    if (t.kind !== "rejected") return;
    expect(t.failures.some((f) => "code" in f && f.code === "target_size_floor")).toBe(true);
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
    const t = compileNeutral(spec.colors.neutral);
    const ratio = contrast(t.light["--muted-foreground"], t.light["--muted"]);
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
    const t1 = await driveBeat(s, STRIPE);
    expect(t1.kind).toBe("diff");
    if (t1.kind !== "diff") return;
    s = acknowledge({ ...s, candidate: t1.candidate, pendingSpec: t1.pendingSpec });
    const t2 = await driveBeat(s, STRIPE); // same delta onto the now-Stripe draft → empty diff
    expect(t2.kind).toBe("no_change");
  });
});

describe("session accumulation (the page-held draft composes across acks)", () => {
  it("two acknowledged success beats compose into one draft", async () => {
    let s = fresh();
    const t1 = await driveBeat(s, STRIPE);
    if (t1.kind !== "diff") throw new Error("beat #1 should diff");
    s = acknowledge({ ...s, candidate: t1.candidate, pendingSpec: t1.pendingSpec });
    const t2 = await driveBeat(s, SOFTEN);
    if (t2.kind !== "diff") throw new Error("beat #2 should diff");
    s = acknowledge({ ...s, candidate: t2.candidate, pendingSpec: t2.pendingSpec });
    expect(s.draft.radius).toBe(16); // from Soften beat
    expect(s.draft.colors?.primary).toBeDefined(); // from Stripe beat
    expect(s.draft.colors?.neutral).toBeDefined(); // Stripe beat — composed, not overwritten
  });
});
