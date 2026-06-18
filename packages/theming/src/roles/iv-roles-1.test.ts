// packages/theming/src/roles/iv-roles-1.test.ts
import { describe, it, expect } from "vitest";
import { ivRoles1, VOCAB_VERSION } from "./iv-roles-1.js";

describe("ivRoles1 (the §3 shadcn instance)", () => {
  it("vocab version constant", () => {
    expect(VOCAB_VERSION).toBe("iv-roles-1");
  });

  it("seeds: brand + ramp + dimension + axes + typography picks; neutral & density present", () => {
    expect(ivRoles1.seeds).toEqual([
      "primary",
      "accent",
      "neutral",
      "destructive",
      "radius",
      "density",
      "mode",
      "display",
      "body",
      "mono",
    ]);
  });

  it("has exactly the 27 core output roles", () => {
    expect(Object.keys(ivRoles1.roles).sort()).toEqual(
      [
        "primary",
        "accent",
        "destructive",
        "background",
        "card",
        "popover",
        "muted",
        "secondary",
        "border",
        "input",
        "ring",
        "foreground",
        "card-fg",
        "popover-fg",
        "secondary-fg",
        "primary-fg",
        "accent-fg",
        "destructive-fg",
        "muted-fg",
        "radius",
        "radius-sm",
        "radius-md",
        "radius-lg",
        "radius-xl",
        "font-display",
        "font-body",
        "font-mono",
      ].sort(),
    );
    expect(Object.keys(ivRoles1.roles)).toHaveLength(27);
  });

  it("neutral is seed-only (no --neutral output role)", () => {
    expect(ivRoles1.seeds).toContain("neutral");
    expect(ivRoles1.roles["neutral"]).toBeUndefined();
  });

  it("brand seeds derive as {kind:seed}", () => {
    for (const r of ["primary", "accent", "destructive", "radius"]) {
      expect(ivRoles1.roles[r]!.derivation).toEqual({ kind: "seed", seed: r });
    }
    expect(ivRoles1.roles["primary"]!.kind).toBe("color");
    expect(ivRoles1.roles["radius"]!.kind).toBe("dimension");
  });

  it("surfaces: background is surface-anchor; card/popover/muted/secondary are surface-step", () => {
    expect(ivRoles1.roles["background"]!.derivation).toEqual({ kind: "surface-anchor", seed: "neutral" });
    for (const r of ["card", "popover", "muted", "secondary"]) {
      const d = ivRoles1.roles[r]!.derivation;
      expect(d.kind).toBe("surface-step");
      expect((d as { seed: string }).seed).toBe("neutral");
    }
  });

  it("lines: border/input are line-step(neutral)", () => {
    for (const r of ["border", "input"]) {
      const d = ivRoles1.roles[r]!.derivation;
      expect(d.kind).toBe("line-step");
      expect((d as { seed: string }).seed).toBe("neutral");
    }
  });

  it("ring is accent-line(primary)", () => {
    expect(ivRoles1.roles["ring"]!.derivation).toEqual({ kind: "accent-line", seed: "primary" });
  });

  it("foregrounds bind to their bg via maximize-contrast, muted-fg via minimum-legible", () => {
    const bind: Record<string, string> = {
      foreground: "background",
      "card-fg": "card",
      "popover-fg": "popover",
      "secondary-fg": "secondary",
      "primary-fg": "primary",
      "accent-fg": "accent",
      "destructive-fg": "destructive",
    };
    for (const [fg, bg] of Object.entries(bind)) {
      expect(ivRoles1.roles[fg]!.derivation).toEqual({
        kind: "foreground-of",
        bg,
        strategy: "maximize-contrast",
      });
    }
    expect(ivRoles1.roles["muted-fg"]!.derivation).toEqual({
      kind: "foreground-of",
      bg: "muted",
      strategy: "minimum-legible",
    });
  });

  it("radius offsets derive from radius seed", () => {
    for (const step of ["sm", "md", "lg", "xl"]) {
      expect(ivRoles1.roles[`radius-${step}`]!.derivation).toEqual({
        kind: "offset",
        seed: "radius",
        step,
      });
      expect(ivRoles1.roles[`radius-${step}`]!.kind).toBe("dimension");
    }
  });

  it("typography picks", () => {
    expect(ivRoles1.roles["font-display"]!.derivation).toEqual({ kind: "pick", axis: "display" });
    expect(ivRoles1.roles["font-body"]!.derivation).toEqual({ kind: "pick", axis: "body" });
    expect(ivRoles1.roles["font-mono"]!.derivation).toEqual({ kind: "pick", axis: "mono" });
    expect(ivRoles1.roles["font-body"]!.kind).toBe("typography");
  });

  it("contrastPairs: text/large-text/ui exactly per §3 (border/input NOT checked)", () => {
    const text = ivRoles1.contrastPairs.filter((p) => p.category === "text");
    expect(text.map((p) => [p.fg, p.bg])).toEqual([
      ["foreground", "background"],
      ["card-fg", "card"],
      ["popover-fg", "popover"],
      ["primary-fg", "primary"],
      ["secondary-fg", "secondary"],
      ["accent-fg", "accent"],
      ["destructive-fg", "destructive"],
    ]);
    const large = ivRoles1.contrastPairs.filter((p) => p.category === "large-text");
    expect(large.map((p) => [p.fg, p.bg])).toEqual([["muted-fg", "muted"]]);
    const ui = ivRoles1.contrastPairs.filter((p) => p.category === "ui");
    expect(ui.map((p) => [p.fg, p.bg])).toEqual([
      ["ring", "background"],
      ["ring", "card"],
      ["ring", "popover"],
    ]);
    // border/input never appear as a pair member
    for (const p of ivRoles1.contrastPairs) {
      expect(p.fg).not.toBe("border");
      expect(p.bg).not.toBe("border");
      expect(p.fg).not.toBe("input");
      expect(p.bg).not.toBe("input");
    }
  });
});
