// apps/control-plane/test/theming/delivery/preview.test.ts
import { describe, it, expect } from "vitest";
import { previewTag } from "../../../src/theming/delivery/preview.js";
import {
  resolveThemeTag,
  resolveBlockingScript,
  bootstrapMode,
  MODE_COOKIE,
} from "../../../src/theming/delivery/index.js";
import type { ThemeArtifact } from "@invariance/theming";

function art(vars: Record<string, string>): ThemeArtifact {
  return {
    schemaVersion: 1,
    vocabVersion: "iv-roles-1",
    profileVersion: "iv-profile-1",
    appId: "shadcn-can",
    modes: { light: { selector: ":root", vars } },
    meta: { verifierReport: { ok: true }, contrastFloor: null, chromaCap: 0.4 },
  } as ThemeArtifact;
}

describe("delivery barrel", () => {
  it("re-exports the public delivery surface (both tiers + bootstrap + preview)", () => {
    expect(typeof resolveThemeTag).toBe("function");
    expect(typeof resolveBlockingScript).toBe("function");
    expect(typeof bootstrapMode).toBe("function");
    expect(typeof previewTag).toBe("function");
    expect(MODE_COOKIE).toBe("iv-theme-mode");
  });
});

describe("previewTag (same-origin reference gallery, no pointer store)", () => {
  it("renders a styleTag directly from a candidate artifact", () => {
    const r = previewTag(art({ "--background": "oklch(1 0 0)" }), "light", "nce");
    expect("tag" in r && typeof r.tag === "string").toBe(true);
    expect((r as { tag: string }).tag).toContain('nonce="nce"');
    expect((r as { tag: string }).tag).toContain("--background");
  });

  it("fails open on an unsafe value", () => {
    const r = previewTag(art({ "--x": "red;} body{display:none}" }), "light", "nce");
    expect(r).toEqual({ tag: null, reason: "unsafe_value" });
  });

  it("fails open with no nonce", () => {
    const r = previewTag(art({ "--background": "oklch(1 0 0)" }), "light", "");
    expect(r).toEqual({ tag: null, reason: "no_nonce" });
  });
});
