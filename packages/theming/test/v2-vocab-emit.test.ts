import { describe, it, expect } from "vitest";
import { compile } from "../src/compile/index.js";
import { SHADCN_CAN, SHADCN_CAN_V2 } from "../src/manifest/index.js";
import { parseSpec } from "../src/spec/index.js";
import { getRoleGraph, ivRoles1 } from "../src/roles/index.js";
import { ivProfile1, ivProfile2, getRampProfile } from "../src/profile/index.js";

// Build a canonical StyleSpec through the wall, the way the runtime does.
function spec(raw: unknown, manifest = SHADCN_CAN_V2) {
  const p = parseSpec(raw, manifest);
  if (!p.ok) throw new Error(`setup: ${JSON.stringify(p.failures)}`);
  return p.spec;
}

describe("iv-roles-2 / iv-profile-2 — append-only vocabulary", () => {
  it("v2 role graph = v1 + exactly 7 spacing roles, all space-step on density; contrastPairs identical", () => {
    const v1 = getRoleGraph("iv-roles-1");
    const v2 = getRoleGraph("iv-roles-2");
    const v1count = Object.keys(v1.roles).length;
    const v2count = Object.keys(v2.roles).length;
    expect(v2count).toBe(v1count + 7);
    for (const step of ["2xs", "xs", "sm", "md", "lg", "xl", "2xl"]) {
      const r = v2.roles[`space-${step}`];
      expect(r, `space-${step} exists`).toBeDefined();
      expect(r.kind).toBe("dimension");
      expect(r.derivation).toEqual({ kind: "space-step", seed: "density", step });
    }
    // contrast machinery is provably untouched: same pair set as v1.
    expect(v2.contrastPairs).toEqual(v1.contrastPairs);
    expect(v2.seeds).toEqual(v1.seeds);
  });

  it("iv-profile-2 carries v1's mode profiles byte-identically (guards the inlined duplication from drift)", () => {
    expect(ivProfile2.light).toEqual(ivProfile1.light);
    expect(ivProfile2.dark).toEqual(ivProfile1.dark);
    expect(ivProfile2.radiusOffsets).toEqual(ivProfile1.radiusOffsets);
    expect(getRampProfile("iv-profile-2")).toBe(ivProfile2);
  });
});

describe("compile v2 — density-driven spacing emit", () => {
  const md = "--space-md";
  it("--space-md tracks density from the profile table", () => {
    const compact = compile(spec({ density: "compact" }), SHADCN_CAN_V2);
    const comfy = compile(spec({ density: "comfortable" }), SHADCN_CAN_V2);
    const spacious = compile(spec({ density: "spacious" }), SHADCN_CAN_V2);
    expect(compact.light[md]).toBe("12px");
    expect(comfy.light[md]).toBe("18px");
    expect(spacious.light[md]).toBe("24px");
    // (mode-stability of dimension roles is proven in the dark-enabled demo manifest, C3.)
  });

  it("emits the full 7-step scale", () => {
    const c = compile(spec({ density: "compact" }), SHADCN_CAN_V2).light;
    expect(c["--space-2xs"]).toBe("2px");
    expect(c["--space-xs"]).toBe("4px");
    expect(c["--space-sm"]).toBe("8px");
    expect(c["--space-lg"]).toBe("20px");
    expect(c["--space-xl"]).toBe("32px");
    expect(c["--space-2xl"]).toBe("44px");
  });

  it("default density (manifest defaultSeeds = comfortable) when the draft omits it", () => {
    const c = compile(spec({}), SHADCN_CAN_V2).light;
    expect(c[md]).toBe("18px");
  });
});

describe("compile v2 — typography pick resolution", () => {
  it("resolves the draft's pick to the allowlist stack", () => {
    const c = compile(spec({ typography: { display: "mono" } }), SHADCN_CAN_V2).light;
    expect(c["--font-display"]).toBe("ui-monospace, monospace");
  });
  it("falls back to the base stack when the draft sets no pick", () => {
    const c = compile(spec({}), SHADCN_CAN_V2).light;
    expect(c["--font-display"]).toBe("ui-sans-serif, system-ui, sans-serif");
    expect(c["--font-mono"]).toBe("ui-monospace, monospace");
  });
  it("a different pick resolves to a different stack", () => {
    const c = compile(spec({ typography: { body: "serif" } }), SHADCN_CAN_V2).light;
    expect(c["--font-sans"]).toBe("ui-serif, Georgia, serif"); // --font-sans → font-body role
  });
});

describe("v1 byte-identical guard — no leak from the v2 emit branches", () => {
  it("SHADCN_CAN (v1) emits NO spacing vars, and a typography PICK stays inert (picksResolve off)", () => {
    // The exact shape that leaked: v1 ignored picks (emitted base verbatim). With no font-body base,
    // --font-sans must remain ABSENT even when the draft sets a pick — i.e. picksResolve gates this.
    const p = parseSpec({ typography: { body: "sans" }, density: "compact" }, SHADCN_CAN);
    if (!p.ok) throw new Error("setup");
    const c = compile(p.spec, SHADCN_CAN);
    for (const k of Object.keys(c.light)) expect(k.startsWith("--space-")).toBe(false);
    expect(c.light["--font-sans"]).toBeUndefined();
    expect(getRoleGraph("iv-roles-1").picksResolve).toBeFalsy();
    expect(Object.keys(ivRoles1.roles).some((r) => r.startsWith("space-"))).toBe(false);
  });
});
