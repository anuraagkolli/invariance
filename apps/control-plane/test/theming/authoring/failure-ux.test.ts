import { describe, it, expect } from "vitest";
import type { WallFailure, VerifyFailure } from "@invariance/theming";
import { failureTemplate } from "../../../src/theming/authoring/failure-ux.js";

describe("failureTemplate — wall codes", () => {
  it("seed_locked names the offending path and is deterministic", () => {
    const f: WallFailure = { code: "seed_locked", path: "colors.primary", message: "primary is locked" };
    const a = failureTemplate(f);
    const b = failureTemplate(f);
    expect(a).toEqual(b); // deterministic
    expect(a.code).toBe("seed_locked");
    expect(a.detail).toContain("colors.primary");
    expect(a.headline.length).toBeGreaterThan(0);
  });

  it("unparseable_color suggests a valid color", () => {
    const f: WallFailure = { code: "unparseable_color", path: "colors.accent", message: "bad" };
    const out = failureTemplate(f);
    expect(out.code).toBe("unparseable_color");
    expect(out.suggestion).toBeTruthy();
  });

  it("font_not_allowed names the path", () => {
    const f: WallFailure = { code: "font_not_allowed", path: "typography.body", message: "no" };
    expect(failureTemplate(f).detail).toContain("typography.body");
  });

  it("covers every wall code without throwing", () => {
    const codes: WallFailure["code"][] = [
      "unknown_key",
      "unparseable_color",
      "font_not_allowed",
      "seed_locked",
      "out_of_range",
      "schema_invalid",
    ];
    for (const code of codes) {
      const out = failureTemplate({ code, path: "x", message: "m" });
      expect(out.code).toBe(code);
      expect(out.headline.length).toBeGreaterThan(0);
      expect(out.detail.length).toBeGreaterThan(0);
    }
  });
});

describe("failureTemplate — verifier codes", () => {
  it("contrast_floor fills required + actual + mode", () => {
    const f: VerifyFailure = {
      code: "contrast_floor",
      mode: "dark",
      pair: { fg: "foreground", bg: "background", category: "text" },
      required: 4.5,
      actual: 3.1,
      message: "low contrast",
    };
    const out = failureTemplate(f);
    expect(out.code).toBe("contrast_floor");
    expect(out.detail).toContain("4.5");
    expect(out.detail).toContain("3.1");
    expect(out.detail).toContain("dark");
  });

  it("locked_drift names the role", () => {
    const f: VerifyFailure = { code: "locked_drift", mode: "light", role: "primary", varName: "--primary", message: "drift" };
    expect(failureTemplate(f).detail).toContain("primary");
  });

  it("covers every verifier code without throwing", () => {
    const base = { mode: "light" as const, message: "m" };
    const codes: VerifyFailure["code"][] = [
      "contrast_floor",
      "locked_drift",
      "chroma_cap",
      "mode_not_allowed",
      "unsafe_value",
    ];
    for (const code of codes) {
      const out = failureTemplate({ ...base, code });
      expect(out.code).toBe(code);
      expect(out.headline.length).toBeGreaterThan(0);
      expect(out.detail.length).toBeGreaterThan(0);
    }
  });
});
