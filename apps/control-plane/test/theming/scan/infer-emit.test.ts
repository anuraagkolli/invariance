import { describe, it, expect } from "vitest";
import { inferEmit } from "../../../src/theming/scan/infer-emit.js";

describe("inferEmit — consumption dictates when it wraps", () => {
  it("hsl wrapping → triple/hsl, confirmed", () => {
    const out = inferEmit({
      consumptionSites: [{ wrapping: "hsl", selector: "body", property: "background-color" }],
      heldFormat: "hsl-triple",
      opaqueDowngrade: false,
    });
    expect(out.emit).toEqual({ shape: "triple", space: "hsl", precision: 4 });
    expect(out.confidence).toBe("confirmed");
  });

  it("oklch wrapping → triple/oklch, confirmed", () => {
    const out = inferEmit({
      consumptionSites: [{ wrapping: "oklch", selector: "a", property: "color" }],
      heldFormat: "oklch",
      opaqueDowngrade: false,
    });
    expect(out.emit).toEqual({ shape: "triple", space: "oklch", precision: 4 });
    expect(out.confidence).toBe("confirmed");
  });
});

describe("inferEmit — raw-consumption carve-out (held dictates)", () => {
  it("raw + number held → number/null, confirmed", () => {
    const out = inferEmit({
      consumptionSites: [{ wrapping: "raw", selector: ".btn", property: "border-radius" }],
      heldFormat: "number",
      opaqueDowngrade: false,
    });
    expect(out.emit).toEqual({ shape: "number", space: null, precision: 4 });
    expect(out.confidence).toBe("confirmed");
  });

  it("raw + oklch held → raw/null, confirmed", () => {
    const out = inferEmit({
      consumptionSites: [{ wrapping: "raw", selector: "a", property: "color" }],
      heldFormat: "oklch",
      opaqueDowngrade: false,
    });
    expect(out.emit).toEqual({ shape: "raw", space: null, precision: 4 });
    expect(out.confidence).toBe("confirmed");
  });
});

describe("inferEmit — color-mix carve-out", () => {
  it("any color-mix site → inferred, reason color_mix", () => {
    const out = inferEmit({
      consumptionSites: [{ wrapping: "color-mix", selector: ".ring", property: "box-shadow" }],
      heldFormat: "hsl-triple",
      opaqueDowngrade: false,
    });
    expect(out.confidence).toBe("inferred");
    expect(out.reason).toBe("color_mix");
  });
});

describe("inferEmit — opaqueSheets teeth", () => {
  it("downgrades to inferred/opaque_sheet when held does NOT corroborate", () => {
    const out = inferEmit({
      consumptionSites: [{ wrapping: "hsl", selector: "body", property: "color" }],
      heldFormat: "unknown",
      opaqueDowngrade: true,
    });
    expect(out.confidence).toBe("inferred");
    expect(out.reason).toBe("opaque_sheet");
  });

  it("KEEPS confirmed when held corroborates the wrapping (triple matches hsl)", () => {
    const out = inferEmit({
      consumptionSites: [{ wrapping: "hsl", selector: "body", property: "color" }],
      heldFormat: "hsl-triple",
      opaqueDowngrade: true,
    });
    expect(out.confidence).toBe("confirmed");
    expect(out.emit).toEqual({ shape: "triple", space: "hsl", precision: 4 });
  });
});

describe("inferEmit — low-confidence fallback", () => {
  it("empty consumption + non-color held → inferred/low_confidence_inference", () => {
    const out = inferEmit({ consumptionSites: [], heldFormat: "unknown", opaqueDowngrade: false });
    expect(out.confidence).toBe("inferred");
    expect(out.reason).toBe("low_confidence_inference");
  });
});

describe("inferEmit — cross-branch precedence", () => {
  it("(a) color-mix beats a dictating wrapping AND emits held-derived emit", () => {
    const out = inferEmit({
      consumptionSites: [
        { wrapping: "color-mix", selector: ".r", property: "box-shadow" },
        { wrapping: "hsl", selector: ".r", property: "color" },
      ],
      heldFormat: "hsl-triple",
      opaqueDowngrade: false,
    });
    expect(out.confidence).toBe("inferred");
    expect(out.reason).toBe("color_mix");
    expect(out.emit).toEqual({ shape: "triple", space: "hsl", precision: 4 });
  });

  it("(b) mixed dictating wrappings: first wins, confirmed", () => {
    const out = inferEmit({
      consumptionSites: [
        { wrapping: "hsl", selector: ".a", property: "color" },
        { wrapping: "rgb", selector: ".b", property: "background-color" },
      ],
      heldFormat: "hsl-triple",
      opaqueDowngrade: false,
    });
    expect(out.confidence).toBe("confirmed");
    expect(out.emit).toEqual({ shape: "triple", space: "hsl", precision: 4 });
  });

  it("(c) raw + unknown held under opaqueDowngrade → opaque_sheet", () => {
    const out = inferEmit({
      consumptionSites: [{ wrapping: "raw", selector: ".c", property: "border-color" }],
      heldFormat: "unknown",
      opaqueDowngrade: true,
    });
    expect(out.confidence).toBe("inferred");
    expect(out.reason).toBe("opaque_sheet");
  });
});
