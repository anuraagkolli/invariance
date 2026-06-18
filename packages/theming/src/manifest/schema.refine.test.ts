// packages/theming/src/manifest/schema.refine.test.ts
import { describe, it, expect } from "vitest";
import { AppManifest } from "./schema.js";

// An AA-passing, fully consistent manifest. background=white, foreground=black ⇒ ratio 21 ≥ 4.5.
// muted=#f1f1f1, muted-fg=#555 ⇒ large-text floor 3.0. ring=#1a1a1a on white/card/popover ⇒ ui 3.0.
function valid() {
  return {
    appId: "acme",
    manifestVersion: 1,
    vocabVersion: "iv-roles-1",
    profileVersion: "iv-profile-1",
    variables: {
      "--background": { role: "background", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
      "--font-body": { role: "font-body", emit: { shape: "raw", space: null, precision: 0 }, confidence: "confirmed" },
    },
    modes: { allowed: ["light"], default: "light", selectors: { light: ":root" } },
    base: {
      light: {
        background: "#ffffff",
        foreground: "#000000",
        card: "#ffffff",
        "card-fg": "#000000",
        popover: "#ffffff",
        "popover-fg": "#000000",
        primary: "#1a1a1a",
        "primary-fg": "#ffffff",
        secondary: "#f4f4f5",
        "secondary-fg": "#18181b",
        accent: "#1a1a1a",
        "accent-fg": "#ffffff",
        destructive: "#b91c1c",
        "destructive-fg": "#ffffff",
        muted: "#f1f1f1",
        "muted-fg": "#555555",
        ring: "#1a1a1a",
      },
    },
    defaultSeeds: {
      colors: { primary: "#1a1a1a", accent: "#1a1a1a", neutral: "#ffffff", destructive: "#b91c1c" },
      radius: 8,
      density: "comfortable",
    },
    invariants: {
      contrastTier: "AA",
      chromaCap: 0.3,
      locks: ["primary"],
      allowedFonts: [{ id: "body-sans", stack: "ui-sans-serif, system-ui" }],
    },
  };
}

describe("AppManifest superRefine", () => {
  it("accepts a fully consistent AA-passing manifest", () => {
    const r = AppManifest.safeParse(valid());
    expect(r.success).toBe(true);
  });

  it("refRolesInVocab: variable role not in vocab rejected", () => {
    const m = valid();
    m.variables["--background"].role = "not-a-role";
    expect(AppManifest.safeParse(m).success).toBe(false);
  });

  it("refRolesInVocab: lock not resolvable rejected", () => {
    const m = valid();
    m.invariants.locks = ["nonsense"];
    expect(AppManifest.safeParse(m).success).toBe(false);
  });

  it("refModesWellFormed: default not in allowed rejected", () => {
    const m = valid();
    m.modes.default = "dark";
    expect(AppManifest.safeParse(m).success).toBe(false);
  });

  it("refDefaultSeedsComplete: enforced by object schema (missing seed)", () => {
    const m = valid();
    delete (m.defaultSeeds.colors as Record<string, string>).accent;
    expect(AppManifest.safeParse(m).success).toBe(false);
  });

  it("refFontsPresentIfTypographyMapped: typography role mapped but allowedFonts empty rejected", () => {
    const m = valid();
    m.variables["--font-body"].role = "font-body"; // already mapped
    m.invariants.allowedFonts = [];
    expect(AppManifest.safeParse(m).success).toBe(false);
  });

  it("refEmitSpaceConsistent: triple with null space rejected", () => {
    const m = valid();
    // space is inferred as "hsl" (literal) by valid(); cast through unknown to assign null for the bad-emit test.
    (m.variables["--background"] as { emit: { shape: string; space: string | null; precision: number } }).emit = { shape: "triple", space: null, precision: 3 };
    expect(AppManifest.safeParse(m).success).toBe(false);
  });

  it("refEmitSpaceConsistent: raw with non-null space rejected", () => {
    const m = valid();
    // space is inferred as null (literal) by valid(); cast through unknown to assign "hsl" for the bad-emit test.
    (m.variables["--font-body"] as { emit: { shape: string; space: string | null; precision: number } }).emit = { shape: "raw", space: "hsl", precision: 0 };
    expect(AppManifest.safeParse(m).success).toBe(false);
  });

  it("refBasePassesTier: base failing AA text floor rejected (low-contrast foreground)", () => {
    const m = valid();
    m.base.light.foreground = "#cccccc"; // ~1.6:1 on white < 4.5
    expect(AppManifest.safeParse(m).success).toBe(false);
  });

  it("refBasePassesTier: AAA tier on AA-only base rejected", () => {
    const m = valid();
    m.invariants.contrastTier = "AAA";
    m.base.light["muted-fg"] = "#777777"; // ~4.0 on #f1f1f1 < 4.5 AAA large-text
    expect(AppManifest.safeParse(m).success).toBe(false);
  });

  it("refLocksResolveAndPinnable: derived-role lock with missing base entry rejected", () => {
    const m = valid();
    m.invariants.locks = ["card"]; // derived role
    delete (m.base.light as Record<string, string>).card; // dangling pin
    // also remove card-fg pair member so the only failure is the dangling lock pin, not a contrast miss
    // (card-fg/card still present; removing card makes the contrast check + lock pin both fail — either rejects)
    expect(AppManifest.safeParse(m).success).toBe(false);
  });

  it("refPerModeSelectorPresent: allowed dark with no dark selector rejected", () => {
    const m = valid();
    m.modes.allowed = ["light", "dark"];
    // provide dark base so the only failure is the missing selector. valid()'s inferred type has no
    // base.dark, so widen base structurally to attach the optional dark map.
    (m.base as { light: Record<string, string>; dark?: Record<string, string> }).dark = { ...m.base.light };
    // no m.modes.selectors.dark
    expect(AppManifest.safeParse(m).success).toBe(false);
  });
});
