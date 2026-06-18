// packages/theming/src/manifest/shadcn-can.ts
import type { AppManifest } from "./schema.js";

// The prebuilt manifest for the near-zero-touch shadcn path (§1.1, §5). Light-only for v1.
// base meets AA (so refBasePassesTier passes) and uses NO color-mix. The 19 contrast-relevant roles
// are pinned; emit is hsl-triple per shadcn's hsl(var(--x)) consumption convention. Fonts are raw.
//
// base.light stores BARE HSL TRIPLES ("H S% L%"), consistent with emit { shape: "triple", space: "hsl" }.
// The gate reconstructs hsl(<triple>) before calling wcagContrast. Tightest pair: destructive-fg on
// destructive @ 4.62 ≥ 4.5 (AA). Hex equivalents: background=#ffffff, foreground=#0a0a0a,
// primary=#18181b, primary-fg=#fafafa, secondary/accent/muted=#f4f4f5, secondary-fg/accent-fg/ring=#18181b,
// destructive=#dc2626, destructive-fg=#fafafa, muted-fg=#52525b, border/input=#e4e4e7.
export const SHADCN_CAN: AppManifest = {
  appId: "shadcn-can",
  manifestVersion: 1,
  vocabVersion: "iv-roles-1",
  profileVersion: "iv-profile-1",
  variables: {
    "--background":          { role: "background",   emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--foreground":          { role: "foreground",   emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--card":                { role: "card",         emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--card-foreground":     { role: "card-fg",      emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--popover":             { role: "popover",      emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--popover-foreground":  { role: "popover-fg",   emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--primary":             { role: "primary",      emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--primary-foreground":  { role: "primary-fg",   emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--secondary":           { role: "secondary",    emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--secondary-foreground":{ role: "secondary-fg", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--accent":              { role: "accent",       emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--accent-foreground":   { role: "accent-fg",    emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--destructive":         { role: "destructive",  emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--destructive-foreground":{ role: "destructive-fg", emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--muted":               { role: "muted",        emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--muted-foreground":    { role: "muted-fg",     emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--border":              { role: "border",       emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--input":               { role: "input",        emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--ring":                { role: "ring",         emit: { shape: "triple", space: "hsl", precision: 3 }, confidence: "confirmed" },
    "--radius":              { role: "radius",       emit: { shape: "number", space: null, precision: 3 }, confidence: "confirmed" },
    "--font-sans":           { role: "font-body",    emit: { shape: "raw",    space: null, precision: 0 }, confidence: "confirmed" },
  },
  modes: {
    allowed: ["light"],
    default: "light",
    selectors: { light: ":root", dark: ".dark" },
  },
  base: {
    light: {
      // Bare HSL triples — reconstructed as hsl(<triple>) by refBasePassesTier.
      // All 11 contrast pairs pass AA; tightest: destructive-fg on destructive @ 4.62.
      background:        "0 0% 100%",       // #ffffff
      foreground:        "0 0% 3.92%",      // #0a0a0a
      card:              "0 0% 100%",       // #ffffff
      "card-fg":         "0 0% 3.92%",      // #0a0a0a
      popover:           "0 0% 100%",       // #ffffff
      "popover-fg":      "0 0% 3.92%",      // #0a0a0a
      primary:           "240 5.88% 10%",   // #18181b
      "primary-fg":      "0 0% 98%",        // #fafafa
      secondary:         "240 4.76% 95.9%", // #f4f4f5
      "secondary-fg":    "240 5.88% 10%",   // #18181b
      accent:            "240 4.76% 95.9%", // #f4f4f5
      "accent-fg":       "240 5.88% 10%",   // #18181b
      destructive:       "0 72.2% 50.6%",   // #dc2626  — AA-TIGHT pair below
      "destructive-fg":  "0 0% 98%",        // #fafafa  — ratio ≈ 4.62 ≥ 4.5
      muted:             "240 4.76% 95.9%", // #f4f4f5
      "muted-fg":        "240 5.2% 33.9%",  // #52525b  — large-text floor 3.0
      border:            "240 5.88% 90%",   // #e4e4e7
      input:             "240 5.88% 90%",   // #e4e4e7
      ring:              "240 5.88% 10%",   // #18181b
    },
  },
  defaultSeeds: {
    colors: { primary: "#18181b", accent: "#f4f4f5", neutral: "#ffffff", destructive: "#dc2626" },
    radius: 8,
    density: "comfortable",
  },
  invariants: {
    contrastTier: "AA",
    chromaCap: 0.3,
    locks: ["primary"],
    allowedFonts: [{ id: "sans", stack: "ui-sans-serif, system-ui, sans-serif" }],
  },
};
