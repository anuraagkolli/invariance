import { describe, it, expect } from "vitest";
import { compile } from "../src/compile/index.js";
import { verify } from "../src/verify/index.js";
import { failureTemplate } from "../src/authoring/index.js";
import { SHADCN_CAN, SHADCN_CAN_V2 } from "../src/manifest/index.js";
import { parseSpec } from "../src/spec/index.js";

function compileSpec(raw: unknown, manifest = SHADCN_CAN_V2) {
  const p = parseSpec(raw, manifest);
  if (!p.ok) throw new Error(`setup: ${JSON.stringify(p.failures)}`);
  return compile(p.spec, manifest);
}

describe("verify — target_size_floor (WCAG 2.2 §2.5.8)", () => {
  it("REJECTS compact density (controls fall below the 24px target minimum)", () => {
    const v = verify(compileSpec({ density: "compact" }), SHADCN_CAN_V2);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    const f = v.failures.find((x) => x.code === "target_size_floor");
    expect(f, "a target_size_floor failure is present").toBeDefined();
    expect(f!.required).toBe(24);
    expect(f!.actual).toBe(22); // 14 content + 2×4 (compact --space-xs)
  });

  it("PASSES comfortable and spacious (controls clear 24px)", () => {
    expect(verify(compileSpec({ density: "comfortable" }), SHADCN_CAN_V2).ok).toBe(true);
    expect(verify(compileSpec({ density: "spacious" }), SHADCN_CAN_V2).ok).toBe(true);
  });

  it("fires only ONCE (spacing is mode-stable — no duplicate per-mode failures)", () => {
    const v = verify(compileSpec({ density: "compact" }), SHADCN_CAN_V2);
    if (v.ok) throw new Error("expected reject");
    expect(v.failures.filter((x) => x.code === "target_size_floor")).toHaveLength(1);
  });

  it("no-ops when the manifest declares no legibilityFloor (v1 SHADCN_CAN)", () => {
    // v1 has no floor and no --space-xs var → the rule must not fire (and never crash).
    const p = parseSpec({ colors: { accent: "oklch(0.7 0.1 50)" } }, SHADCN_CAN);
    if (!p.ok) throw new Error("setup");
    const v = verify(compile(p.spec, SHADCN_CAN), SHADCN_CAN);
    if (!v.ok) expect(v.failures.some((x) => x.code === "target_size_floor")).toBe(false);
    else expect(v.ok).toBe(true);
  });

  it("failureTemplate renders the WCAG-anchored copy from the engine result", () => {
    const v = verify(compileSpec({ density: "compact" }), SHADCN_CAN_V2);
    if (v.ok) throw new Error("expected reject");
    const f = v.failures.find((x) => x.code === "target_size_floor")!;
    const m = failureTemplate(f);
    expect(m.code).toBe("target_size_floor");
    expect(m.headline).toMatch(/cramped|accessible/i);
    expect(m.detail).toContain("24");
    expect(m.detail).toContain("22");
  });
});
