import { describe, it, expect } from "vitest";
import { toOklch, contrast, stepFgL, emitValue } from "../src/compile/oklch.js";
import type { Oklch } from "../src/spec/index.js";
import type { EmitContract } from "../src/manifest/index.js";

const WHITE: Oklch = toOklch("#ffffff");
const BLACK: Oklch = toOklch("#000000");

describe("toOklch", () => {
  it("parses a hex string to an OKLCH object", () => {
    const o = toOklch("#ffffff");
    expect(o.l).toBeCloseTo(1, 2);
    expect(o.c).toBeCloseTo(0, 2);
  });

  it("parses an oklch() string", () => {
    const o = toOklch("oklch(0.5 0.1 250)");
    expect(o.l).toBeCloseTo(0.5, 3);
    expect(o.c).toBeCloseTo(0.1, 3);
    expect(o.h).toBeCloseTo(250, 1);
  });

  it("throws on an unparseable string (the dangerous value never advances)", () => {
    expect(() => toOklch("javascript:alert(1)")).toThrow(/unparseable color/i);
  });
});

describe("contrast", () => {
  it("white-on-black is the maximal 21:1", () => {
    expect(contrast(WHITE, BLACK)).toBeCloseTo(21, 0);
  });

  it("is symmetric", () => {
    expect(contrast(WHITE, BLACK)).toBeCloseTo(contrast(BLACK, WHITE), 5);
  });
});

describe("stepFgL", () => {
  it("moves L toward the target by one step", () => {
    const fg: Oklch = { l: 0.5, c: 0.05, h: 100 };
    const next = stepFgL(fg, 1.0, 0.1);
    expect(next.l).toBeCloseTo(0.6, 5);
    expect(next.c).toBe(0.05);
    expect(next.h).toBe(100);
  });

  it("moves L toward a darker target (negative direction)", () => {
    const fg: Oklch = { l: 0.5, c: 0.05, h: 100 };
    const next = stepFgL(fg, 0.0, 0.1);
    expect(next.l).toBeCloseTo(0.4, 5);
  });

  it("clamps L to [0,1]", () => {
    const fg: Oklch = { l: 0.95, c: 0, h: 0 };
    expect(stepFgL(fg, 1.0, 0.1).l).toBe(1);
    const fg2: Oklch = { l: 0.05, c: 0, h: 0 };
    expect(stepFgL(fg2, 0.0, 0.1).l).toBe(0);
  });
});

describe("emitValue", () => {
  const hslTriple: EmitContract = { shape: "triple", space: "hsl", precision: 2 };
  const oklchFn: EmitContract = { shape: "function", space: "oklch", precision: 4 };
  const rawNumber: EmitContract = { shape: "number", space: null, precision: 3 };

  it("serializes hsl-triple (no hsl() wrapper, space-separated h s% l%) at fixed precision", () => {
    // white → hsl 0 0% 100%
    const out = emitValue(WHITE, hslTriple, 0.4);
    expect(out).toBe("0 0% 100%");
  });

  it("serializes a function shape with the space wrapper", () => {
    const out = emitValue({ l: 0.5, c: 0.1, h: 250 }, oklchFn, 0.4);
    expect(out.startsWith("oklch(")).toBe(true);
    expect(out.endsWith(")")).toBe(true);
  });

  it("serializes a number shape (radius px) at fixed precision with no space", () => {
    // a "number" emit carries the dimension in the .l field as the px value (compiler convention).
    const out = emitValue({ l: 8, c: 0, h: 0 }, rawNumber, 0.4);
    expect(out).toBe("8");
  });

  it("gamut-maps on convert: an out-of-sRGB OKLCH still serializes to a valid in-gamut hsl-triple", () => {
    // very saturated green beyond sRGB; clampChroma must pull it back so hsl() is meaningful.
    const wild: Oklch = { l: 0.85, c: 0.4, h: 145 };
    const out = emitValue(wild, hslTriple, 0.4);
    // hsl-triple is "<h> <s>% <l>%" — three space-separated tokens, s & l percentages in [0,100].
    const parts = out.split(" ");
    expect(parts).toHaveLength(3);
    const s = parseFloat(parts[1]!.replace("%", ""));
    const l = parseFloat(parts[2]!.replace("%", ""));
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
    expect(l).toBeGreaterThanOrEqual(0);
    expect(l).toBeLessThanOrEqual(100);
  });

  it("clamps chroma to the cap before serializing", () => {
    const wild: Oklch = { l: 0.6, c: 0.5, h: 30 };
    const out = emitValue(wild, oklchFn, 0.1);
    // the second token of oklch(L C H) is the chroma; must be ≤ cap.
    const inner = out.slice("oklch(".length, -1);
    const c = parseFloat(inner.split(" ")[1]!);
    expect(c).toBeLessThanOrEqual(0.1 + 1e-6);
  });
});
