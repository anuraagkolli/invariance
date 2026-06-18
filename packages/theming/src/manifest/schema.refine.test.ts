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

  // ── HSL-triple base tests (the fix) ────────────────────────────────────────────────────────────
  // Real shadcn manifests store base values as bare HSL triples ("0 0% 100%"), not hex. These tests
  // prove that refBasePassesTier reconstructs the parseable color via the variable's emit contract
  // instead of passing the raw triple straight to wcagContrast (which would throw).

  it("refBasePassesTier: valid AA-passing manifest with HSL-triple base values succeeds", () => {
    // All contrast pair roles declared with emit {shape:"triple", space:"hsl"}.
    // Colors chosen so every pair exceeds AA floor:
    //   text pairs:       foreground(0 0% 9%) on background(0 0% 100%) → ~18:1 ✓ (≥4.5)
    //   large-text pair:  muted-fg(0 0% 33%) on muted(0 0% 94%) → ~5.4:1 ✓ (≥3.0)
    //   ui pairs:         ring(0 0% 10%) on background/card/popover(0 0% 100%) → ~17:1 ✓ (≥3.0)
    const m = {
      appId: "shadcn-app",
      manifestVersion: 1,
      vocabVersion: "iv-roles-1",
      profileVersion: "iv-profile-1",
      variables: {
        "--background":    { role: "background",    emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--foreground":    { role: "foreground",    emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--card":          { role: "card",          emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--card-fg":       { role: "card-fg",       emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--popover":       { role: "popover",       emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--popover-fg":    { role: "popover-fg",    emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--primary":       { role: "primary",       emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--primary-fg":    { role: "primary-fg",    emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--secondary":     { role: "secondary",     emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--secondary-fg":  { role: "secondary-fg",  emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--accent":        { role: "accent",        emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--accent-fg":     { role: "accent-fg",     emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--destructive":   { role: "destructive",   emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--destructive-fg":{ role: "destructive-fg",emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--muted":         { role: "muted",         emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--muted-fg":      { role: "muted-fg",      emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--ring":          { role: "ring",          emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--font-body":     { role: "font-body",     emit: { shape: "raw",    space: null,   precision: 0 }, confidence: "confirmed" },
      },
      modes: { allowed: ["light"], default: "light", selectors: { light: ":root" } },
      base: {
        light: {
          // Light surfaces (white-ish)
          background:      "0 0% 100%",
          card:            "0 0% 100%",
          popover:         "0 0% 100%",
          // Foregrounds on those surfaces (near-black ≈ 9% L)
          foreground:      "0 0% 9%",
          "card-fg":       "0 0% 9%",
          "popover-fg":    "0 0% 9%",
          // Brand: dark primary (#1a1a1a ≈ 10% L) with white fg
          primary:         "0 0% 10%",
          "primary-fg":    "0 0% 100%",
          // Secondary: light gray with near-black fg
          secondary:       "0 0% 96%",
          "secondary-fg":  "0 0% 9%",
          // Accent: same as primary
          accent:          "0 0% 10%",
          "accent-fg":     "0 0% 100%",
          // Destructive: saturated red (~4.7:1 on white) — hsl(0 72% 37%) ≈ #a31515
          destructive:     "0 72% 37%",
          "destructive-fg":"0 0% 100%",
          // Muted: very light gray (~94% L); muted-fg at 33% L → ≥5:1 on muted (large-text ≥3.0)
          muted:           "0 0% 94%",
          "muted-fg":      "0 0% 33%",
          // Ring: near-black on white/card/popover → strong ui contrast
          ring:            "0 0% 10%",
        },
      },
      defaultSeeds: {
        colors: { primary: "#1a1a1a", accent: "#1a1a1a", neutral: "#ffffff", destructive: "#a31515" },
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
    const r = AppManifest.safeParse(m);
    // If this fails, log the issues so failures are debuggable without a throw
    if (!r.success) {
      console.error("HSL-triple valid test issues:", JSON.stringify(r.error.issues, null, 2));
    }
    expect(r.success).toBe(true);
  });

  it("refBasePassesTier: sub-AA HSL-triple base is rejected cleanly (no throw)", () => {
    // Same structure as above but foreground is nearly the same lightness as background → fails text contrast.
    // foreground at 90% L on background 100% L → extremely low contrast (~1.2:1) < 4.5 AA.
    const m = {
      appId: "shadcn-low-contrast",
      manifestVersion: 1,
      vocabVersion: "iv-roles-1",
      profileVersion: "iv-profile-1",
      variables: {
        "--background":    { role: "background",    emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--foreground":    { role: "foreground",    emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--card":          { role: "card",          emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--card-fg":       { role: "card-fg",       emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--popover":       { role: "popover",       emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--popover-fg":    { role: "popover-fg",    emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--primary":       { role: "primary",       emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--primary-fg":    { role: "primary-fg",    emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--secondary":     { role: "secondary",     emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--secondary-fg":  { role: "secondary-fg",  emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--accent":        { role: "accent",        emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--accent-fg":     { role: "accent-fg",     emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--destructive":   { role: "destructive",   emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--destructive-fg":{ role: "destructive-fg",emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--muted":         { role: "muted",         emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--muted-fg":      { role: "muted-fg",      emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--ring":          { role: "ring",          emit: { shape: "triple", space: "hsl", precision: 1 }, confidence: "confirmed" },
        "--font-body":     { role: "font-body",     emit: { shape: "raw",    space: null,   precision: 0 }, confidence: "confirmed" },
      },
      modes: { allowed: ["light"], default: "light", selectors: { light: ":root" } },
      base: {
        light: {
          background:      "0 0% 100%",
          // Sub-AA: foreground at 90% lightness on 100% background → ~1.2:1 < 4.5
          foreground:      "0 0% 90%",
          card:            "0 0% 100%",
          "card-fg":       "0 0% 9%",
          popover:         "0 0% 100%",
          "popover-fg":    "0 0% 9%",
          primary:         "0 0% 10%",
          "primary-fg":    "0 0% 100%",
          secondary:       "0 0% 96%",
          "secondary-fg":  "0 0% 9%",
          accent:          "0 0% 10%",
          "accent-fg":     "0 0% 100%",
          destructive:     "0 72% 37%",
          "destructive-fg":"0 0% 100%",
          muted:           "0 0% 94%",
          "muted-fg":      "0 0% 33%",
          ring:            "0 0% 10%",
        },
      },
      defaultSeeds: {
        colors: { primary: "#1a1a1a", accent: "#1a1a1a", neutral: "#ffffff", destructive: "#a31515" },
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
    const r = AppManifest.safeParse(m);
    // Must fail (sub-AA) — and must NOT throw (the defect was an uncaught throw)
    expect(r.success).toBe(false);
    // The failure must be a contrast issue, not a parse error or uncaught exception
    const issues = r.success ? [] : r.error.issues;
    const hasContrastIssue = issues.some(
      (i) => i.message.includes("contrast") && i.message.includes("foreground"),
    );
    expect(hasContrastIssue).toBe(true);
  });
});
