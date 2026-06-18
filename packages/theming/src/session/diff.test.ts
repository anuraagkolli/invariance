// packages/theming/src/session/diff.test.ts
import { describe, it, expect } from "vitest";
import { diffSpecs } from "./diff.js";
import { SHADCN_CAN } from "../manifest/index.js";
import type { StyleSpec } from "../spec/style-spec.js";

const ok = (l: number, c: number, h: number) => ({ l, c, h });

describe("diffSpecs (three-state, resolved values)", () => {
  it("identical drafts emit nothing (empty-diff signal)", () => {
    const d = { colors: { primary: ok(0.3, 0.1, 250) } } as unknown as StyleSpec;
    expect(diffSpecs(d, structuredClone(d) as StyleSpec, SHADCN_CAN)).toEqual([]);
  });

  it("the empty spec vs itself is the canonical no-op", () => {
    expect(diffSpecs({} as StyleSpec, {} as StyleSpec, SHADCN_CAN)).toEqual([]);
  });

  it("adding a field that was absent ⇒ kind added, from null", () => {
    const out = diffSpecs({} as StyleSpec, { radius: 12 } as StyleSpec, SHADCN_CAN);
    const r = out.find((d) => d.role === "radius");
    expect(r).toBeDefined();
    expect(r!.kind).toBe("added");
    expect(r!.from).toBeNull();
    expect(r!.to).toBe("12");
  });

  it("changing a present field ⇒ kind changed, both values resolved", () => {
    const out = diffSpecs({ radius: 8 } as StyleSpec, { radius: 12 } as StyleSpec, SHADCN_CAN);
    const r = out.find((d) => d.role === "radius")!;
    expect(r.kind).toBe("changed");
    expect(r.from).toBe("8");
    expect(r.to).toBe("12");
  });

  it("removing a field ⇒ kind removed, to = app-default resolved value", () => {
    // SHADCN_CAN defaultSeeds.radius = 8; removing a set radius reverts to 8
    const out = diffSpecs({ radius: 12 } as StyleSpec, {} as StyleSpec, SHADCN_CAN);
    const r = out.find((d) => d.role === "radius")!;
    expect(r.kind).toBe("removed");
    expect(r.from).toBe("12");
    expect(r.to).toBe("8"); // app default
  });

  it("a field set to its current value across both specs emits nothing", () => {
    const out = diffSpecs({ density: "compact" } as StyleSpec, { density: "compact" } as StyleSpec, SHADCN_CAN);
    expect(out.find((d) => d.role === "density")).toBeUndefined();
  });

  it("color change resolves to a stable oklch() string for both sides", () => {
    const out = diffSpecs(
      { colors: { accent: ok(0.6, 0.2, 30) } } as unknown as StyleSpec,
      { colors: { accent: ok(0.7, 0.15, 200) } } as unknown as StyleSpec,
      SHADCN_CAN,
    );
    const a = out.find((d) => d.role === "accent")!;
    expect(a.kind).toBe("changed");
    expect(a.from).toMatch(/^oklch\(/);
    expect(a.to).toMatch(/^oklch\(/);
  });

  it("color removal resolves `to` (app default) as an oklch() string, not a raw hex", () => {
    // SHADCN_CAN.defaultSeeds.colors.accent = "#f4f4f5"; removing a set accent reverts to its oklch().
    const out = diffSpecs(
      { colors: { accent: ok(0.6, 0.2, 30) } } as unknown as StyleSpec,
      {} as StyleSpec,
      SHADCN_CAN,
    );
    const a = out.find((d) => d.role === "accent")!;
    expect(a.kind).toBe("removed");
    expect(a.from).toMatch(/^oklch\(/);
    expect(a.to).toMatch(/^oklch\(/); // resolved app default, same string form as a present value
    expect(a.to).not.toMatch(/^#/); // never a raw hex
  });
});
