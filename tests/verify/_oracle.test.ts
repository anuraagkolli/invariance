import { describe, expect, it } from "vitest";
import {
  REQUIRED_CONTRAST,
  chromaOf,
  contrastRatio,
  oklchToSrgb,
  parseToSrgb,
  relativeLuminance,
  requiredContrastIndep,
  srgbToOklch,
} from "./_oracle.js";

// ─────────────────────────────────────────────────────────────────────────────
// Self-tests for the INDEPENDENT oracle. Expected values are canonical constants
// taken from the WCAG 2.x relative-luminance definition and Björn Ottosson's OKLab
// reference — NOT from the engine. If the oracle's math is wrong, these fail.
// The oracle deliberately shares NO code with @invariance/theming (no culori).
// ─────────────────────────────────────────────────────────────────────────────

describe("oracle: WCAG relative luminance", () => {
  it("white = 1, black = 0", () => {
    expect(relativeLuminance({ r: 1, g: 1, b: 1 })).toBeCloseTo(1, 6);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 6);
  });
});

describe("oracle: WCAG contrast ratio", () => {
  it("white vs black = 21 (the maximum)", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 4);
  });
  it("a color against itself = 1", () => {
    expect(contrastRatio("#3b82f6", "#3b82f6")).toBeCloseTo(1, 6);
  });
  it("#767676 on white ≈ 4.54 (the canonical 'smallest passing gray')", () => {
    // independently computed: Y(#767676)=0.18114 → (1.05)/(0.18114+0.05)=4.542
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 1);
  });
  it("is symmetric (order does not matter)", () => {
    const a = contrastRatio("#1e293b", "#f8fafc");
    const b = contrastRatio("#f8fafc", "#1e293b");
    expect(a).toBeCloseTo(b, 9);
  });
  it("parses bare HSL triples using the declared space (matches hsl() function form)", () => {
    const triple = contrastRatio("0 0% 100%", "0 0% 0%", "hsl", "hsl");
    const fn = contrastRatio("hsl(0 0% 100%)", "hsl(0 0% 0%)");
    expect(triple).toBeCloseTo(21, 4);
    expect(triple).toBeCloseTo(fn, 9);
  });
});

describe("oracle: HSL → sRGB", () => {
  it("pure-saturation hues land on RGB primaries", () => {
    expect(parseToSrgb("0 100% 50%", "hsl")).toMatchObject({ r: 1, g: 0, b: 0 });
    expect(parseToSrgb("120 100% 50%", "hsl")).toMatchObject({ r: 0, g: 1, b: 0 });
    expect(parseToSrgb("240 100% 50%", "hsl")).toMatchObject({ r: 0, g: 0, b: 1 });
  });
  it("achromatic triple is gray", () => {
    const g = parseToSrgb("0 0% 50%", "hsl");
    expect(g.r).toBeCloseTo(0.5, 6);
    expect(g.g).toBeCloseTo(0.5, 6);
    expect(g.b).toBeCloseTo(0.5, 6);
  });
});

describe("oracle: sRGB → OKLCH (independent OKLab impl)", () => {
  it("sRGB red = oklch(0.628 0.2577 29.23)", () => {
    const ok = srgbToOklch({ r: 1, g: 0, b: 0 });
    expect(ok.L).toBeCloseTo(0.6279, 2);
    expect(ok.C).toBeCloseTo(0.2577, 2);
    expect(ok.h).toBeCloseTo(29.23, 0);
  });
  it("white is ~achromatic with L≈1", () => {
    const ok = srgbToOklch({ r: 1, g: 1, b: 1 });
    expect(ok.L).toBeCloseTo(1, 2);
    expect(ok.C).toBeLessThan(0.002);
  });
  it("chromaOf reads OKLCH chroma of an emitted hex", () => {
    expect(chromaOf("#ff0000")).toBeCloseTo(0.2577, 2);
    expect(chromaOf("#ffffff")).toBeLessThan(0.002);
  });
  it("OKLCH↔sRGB round-trips", () => {
    const start = { L: 0.7, C: 0.1, h: 150 };
    const back = srgbToOklch(oklchToSrgb(start));
    expect(back.L).toBeCloseTo(start.L, 4);
    expect(back.C).toBeCloseTo(start.C, 4);
    expect(back.h).toBeCloseTo(start.h, 2);
  });
});

describe("oracle: requiredContrast table (independent of engine)", () => {
  it("matches the spec §6 table exactly", () => {
    expect(REQUIRED_CONTRAST.AA.text).toBe(4.5);
    expect(REQUIRED_CONTRAST.AA["large-text"]).toBe(3.0);
    expect(REQUIRED_CONTRAST.AA.ui).toBe(3.0);
    expect(REQUIRED_CONTRAST.AAA.text).toBe(7.0);
    expect(REQUIRED_CONTRAST.AAA["large-text"]).toBe(4.5);
    expect(REQUIRED_CONTRAST.AAA.ui).toBe(3.0);
    expect(requiredContrastIndep("AA", "text")).toBe(4.5);
    expect(requiredContrastIndep("AAA", "ui")).toBe(3.0);
  });
});
