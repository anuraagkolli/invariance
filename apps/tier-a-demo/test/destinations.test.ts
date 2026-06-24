// Validates the two destination specs: Stripe (roomy) and Bloomberg (dense).
// Both are engine-validated (verify ok in light+dark), profiles differ (roomy/dense),
// and the three governance beats reject with the correct codes.
import { compile, parseSpec } from "@invariance/theming";
import { structuralProfile } from "@invariance/theming/spec";
import { describe, expect, it } from "vitest";
import { CannedAgent } from "../src/demo/canned-agent.js";
import { runScriptedTurn } from "../src/demo/run-turn.js";
import { BLOOMBERG_SCRIPT, SCRIPT } from "../src/demo/script.js";
import { DEMO_MANIFEST } from "../src/demo/manifest.js";
import { APP_DEFAULT_SPEC, type Session } from "../src/demo/wiring.js";

const STRIPE_PROMPT = "Make it match Stripe.";
const BLOOMBERG_PROMPT = "Match Bloomberg — amber terminal.";
const SATURATED_PROMPT = "Make the surfaces a bold, saturated orange.";
const COMPACT_PROMPT = "Cram everything in — make it compact.";
const RECOLOR_ERROR_PROMPT = "Recolor the error state to a friendly green.";

const stripeFresh = (): Session => ({ tenant: "stripe", draft: APP_DEFAULT_SPEC, published: null });
const bloombergFresh = (): Session => ({ tenant: "bloomberg", draft: APP_DEFAULT_SPEC, published: null });

const stripeAgent = new CannedAgent(SCRIPT);
const bloombergAgent = new CannedAgent(BLOOMBERG_SCRIPT);

describe("destination specs verify in light AND dark", () => {
  it("Stripe → kind:diff (verifies, AA in both modes)", async () => {
    const t = await runScriptedTurn(stripeAgent, stripeFresh(), STRIPE_PROMPT, DEMO_MANIFEST);
    expect(t.kind).toBe("diff");
    if (t.kind !== "diff") return;
    // both-mode proof: dark vars must be emitted
    expect(t.candidate.dark && Object.keys(t.candidate.dark).length > 0).toBe(true);
  });

  it("Bloomberg → kind:diff (verifies, AA in both modes)", async () => {
    const t = await runScriptedTurn(bloombergAgent, bloombergFresh(), BLOOMBERG_PROMPT, DEMO_MANIFEST);
    expect(t.kind).toBe("diff");
    if (t.kind !== "diff") return;
    expect(t.candidate.dark && Object.keys(t.candidate.dark).length > 0).toBe(true);
  });
});

describe("structuralProfile: roomy vs dense — the vibe-shift proof", () => {
  it("Stripe compiles to profile=roomy (radius≥12, shadow≠flat)", () => {
    const p = parseSpec((SCRIPT[STRIPE_PROMPT].spec as object) as unknown, DEMO_MANIFEST);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(structuralProfile(p.spec)).toBe("roomy");
  });

  it("Bloomberg compiles to profile=dense (radius=0, shadow=flat, borderWeight=hairline)", () => {
    const p = parseSpec((BLOOMBERG_SCRIPT[BLOOMBERG_PROMPT].spec as object) as unknown, DEMO_MANIFEST);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(structuralProfile(p.spec)).toBe("dense");
  });

  it("profiles differ — the side-by-side proves structure, not just hue", () => {
    const stripe = parseSpec((SCRIPT[STRIPE_PROMPT].spec as object) as unknown, DEMO_MANIFEST);
    const bloomberg = parseSpec((BLOOMBERG_SCRIPT[BLOOMBERG_PROMPT].spec as object) as unknown, DEMO_MANIFEST);
    expect(stripe.ok && bloomberg.ok).toBe(true);
    if (!stripe.ok || !bloomberg.ok) return;
    expect(structuralProfile(stripe.spec)).not.toBe(structuralProfile(bloomberg.spec));
  });
});

describe("governance beats reject with the correct codes", () => {
  it("saturated orange → contrast_floor", async () => {
    const t = await runScriptedTurn(stripeAgent, stripeFresh(), SATURATED_PROMPT, DEMO_MANIFEST);
    expect(t.kind).toBe("rejected");
    if (t.kind !== "rejected") return;
    expect(t.failures.some((f) => "code" in f && f.code === "contrast_floor")).toBe(true);
  });

  it("compact density → target_size_floor (the new beat)", async () => {
    const t = await runScriptedTurn(stripeAgent, stripeFresh(), COMPACT_PROMPT, DEMO_MANIFEST);
    expect(t.kind).toBe("rejected");
    if (t.kind !== "rejected") return;
    expect(t.failures.some((f) => "code" in f && f.code === "target_size_floor")).toBe(true);
  });

  it("recolor error state → seed_locked", async () => {
    const t = await runScriptedTurn(stripeAgent, stripeFresh(), RECOLOR_ERROR_PROMPT, DEMO_MANIFEST);
    expect(t.kind).toBe("rejected");
    if (t.kind !== "rejected") return;
    expect(t.failures.some((f) => "code" in f && f.code === "seed_locked")).toBe(true);
  });
});

describe("primary colors differ: two brands, one manifest", () => {
  it("Bloomberg amber primary ≠ Stripe indigo primary", () => {
    const stripe = parseSpec((SCRIPT[STRIPE_PROMPT].spec as object) as unknown, DEMO_MANIFEST);
    const bloomberg = parseSpec((BLOOMBERG_SCRIPT[BLOOMBERG_PROMPT].spec as object) as unknown, DEMO_MANIFEST);
    expect(stripe.ok && bloomberg.ok).toBe(true);
    if (!stripe.ok || !bloomberg.ok) return;
    const sPrimary = compile(stripe.spec, DEMO_MANIFEST).light["--primary"];
    const bPrimary = compile(bloomberg.spec, DEMO_MANIFEST).light["--primary"];
    expect(sPrimary).not.toBe(bPrimary);
  });
});
