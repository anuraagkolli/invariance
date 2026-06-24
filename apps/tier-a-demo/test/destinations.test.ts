// Validates the two destination specs: Soft-SaaS (Acme) and Terminal (Globex).
// Both are engine-validated (verify ok in light+dark), profiles differ (roomy/dense),
// and the three governance beats reject with the correct codes.
import { compile, parseSpec } from "@invariance/theming";
import { structuralProfile } from "@invariance/theming/spec";
import { describe, expect, it } from "vitest";
import { CannedAgent } from "../src/demo/canned-agent.js";
import { runScriptedTurn } from "../src/demo/run-turn.js";
import { GLOBEX_SCRIPT, SCRIPT } from "../src/demo/script.js";
import { DEMO_MANIFEST } from "../src/demo/manifest.js";
import { APP_DEFAULT_SPEC, type Session } from "../src/demo/wiring.js";

const SOFT_SAAS_PROMPT = "Make it feel like Linear — a soft, modern SaaS.";
const TERMINAL_PROMPT = "Make it a Bloomberg-style terminal.";
const SATURATED_PROMPT = "Make the surfaces a bold, saturated orange.";
const COMPACT_PROMPT = "Cram everything in — make it compact.";
const RECOLOR_ERROR_PROMPT = "Recolor the error state to a friendly green.";

const acmeFresh = (): Session => ({ tenant: "acme", draft: APP_DEFAULT_SPEC, published: null });
const globexFresh = (): Session => ({ tenant: "globex", draft: APP_DEFAULT_SPEC, published: null });

const acmeAgent = new CannedAgent(SCRIPT);
const globexAgent = new CannedAgent(GLOBEX_SCRIPT);

describe("destination specs verify in light AND dark", () => {
  it("Soft-SaaS → kind:diff (verifies, AA in both modes)", async () => {
    const t = await runScriptedTurn(acmeAgent, acmeFresh(), SOFT_SAAS_PROMPT, DEMO_MANIFEST);
    expect(t.kind).toBe("diff");
    if (t.kind !== "diff") return;
    // both-mode proof: dark vars must be emitted
    expect(t.candidate.dark && Object.keys(t.candidate.dark).length > 0).toBe(true);
  });

  it("Terminal → kind:diff (verifies, AA in both modes)", async () => {
    const t = await runScriptedTurn(globexAgent, globexFresh(), TERMINAL_PROMPT, DEMO_MANIFEST);
    expect(t.kind).toBe("diff");
    if (t.kind !== "diff") return;
    expect(t.candidate.dark && Object.keys(t.candidate.dark).length > 0).toBe(true);
  });
});

describe("structuralProfile: roomy vs dense — the vibe-shift proof", () => {
  it("Soft-SaaS compiles to profile=roomy (radius≥12, shadow≠flat)", () => {
    const p = parseSpec((SCRIPT[SOFT_SAAS_PROMPT].spec as object) as unknown, DEMO_MANIFEST);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(structuralProfile(p.spec)).toBe("roomy");
  });

  it("Terminal compiles to profile=dense (radius=0, shadow=flat, borderWeight=hairline)", () => {
    const p = parseSpec((GLOBEX_SCRIPT[TERMINAL_PROMPT].spec as object) as unknown, DEMO_MANIFEST);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(structuralProfile(p.spec)).toBe("dense");
  });

  it("profiles differ — the side-by-side proves structure, not just hue", () => {
    const soft = parseSpec((SCRIPT[SOFT_SAAS_PROMPT].spec as object) as unknown, DEMO_MANIFEST);
    const term = parseSpec((GLOBEX_SCRIPT[TERMINAL_PROMPT].spec as object) as unknown, DEMO_MANIFEST);
    expect(soft.ok && term.ok).toBe(true);
    if (!soft.ok || !term.ok) return;
    expect(structuralProfile(soft.spec)).not.toBe(structuralProfile(term.spec));
  });
});

describe("governance beats reject with the correct codes", () => {
  it("saturated orange → contrast_floor", async () => {
    const t = await runScriptedTurn(acmeAgent, acmeFresh(), SATURATED_PROMPT, DEMO_MANIFEST);
    expect(t.kind).toBe("rejected");
    if (t.kind !== "rejected") return;
    expect(t.failures.some((f) => "code" in f && f.code === "contrast_floor")).toBe(true);
  });

  it("compact density → target_size_floor (the new beat)", async () => {
    const t = await runScriptedTurn(acmeAgent, acmeFresh(), COMPACT_PROMPT, DEMO_MANIFEST);
    expect(t.kind).toBe("rejected");
    if (t.kind !== "rejected") return;
    expect(t.failures.some((f) => "code" in f && f.code === "target_size_floor")).toBe(true);
  });

  it("recolor error state → seed_locked", async () => {
    const t = await runScriptedTurn(acmeAgent, acmeFresh(), RECOLOR_ERROR_PROMPT, DEMO_MANIFEST);
    expect(t.kind).toBe("rejected");
    if (t.kind !== "rejected") return;
    expect(t.failures.some((f) => "code" in f && f.code === "seed_locked")).toBe(true);
  });
});

describe("primary colors differ: two brands, one manifest", () => {
  it("Terminal green primary ≠ Soft-SaaS indigo primary", () => {
    const soft = parseSpec((SCRIPT[SOFT_SAAS_PROMPT].spec as object) as unknown, DEMO_MANIFEST);
    const term = parseSpec((GLOBEX_SCRIPT[TERMINAL_PROMPT].spec as object) as unknown, DEMO_MANIFEST);
    expect(soft.ok && term.ok).toBe(true);
    if (!soft.ok || !term.ok) return;
    const sPrimary = compile(soft.spec, DEMO_MANIFEST).light["--primary"];
    const tPrimary = compile(term.spec, DEMO_MANIFEST).light["--primary"];
    expect(sPrimary).not.toBe(tPrimary);
  });
});
