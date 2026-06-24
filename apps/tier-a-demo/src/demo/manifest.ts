// Import from the crypto-free subpath, not the barrel: the barrel pulls artifact/hash-artifact
// (node:crypto), which a browser bundle (App.tsx → manifest.ts) cannot include. `manifest` is
// browser-safe. (Tests import the barrel fine — they run in node.)
import { AppManifest, SHADCN_CAN_V2 } from "@invariance/theming/manifest";

// Default (un-themed) font stacks — system fallbacks; themes override via typography picks.
const FONT_BASE = {
  "font-body": "ui-sans-serif, system-ui, sans-serif",
  "font-display": "ui-sans-serif, system-ui, sans-serif",
  "font-mono": "ui-monospace, monospace",
};

// Standard shadcn "zinc" dark base — AA-designed (same values the verification suite validated),
// plus the default font stacks so an un-themed dark toggle still resolves fonts.
const SHADCN_DARK: Record<string, string> = {
  background: "240 10% 3.9%",
  foreground: "0 0% 98%",
  card: "240 10% 3.9%",
  "card-fg": "0 0% 98%",
  popover: "240 10% 3.9%",
  "popover-fg": "0 0% 98%",
  primary: "0 0% 98%",
  "primary-fg": "240 5.9% 10%",
  secondary: "240 3.7% 15.9%",
  "secondary-fg": "0 0% 98%",
  accent: "240 3.7% 15.9%",
  "accent-fg": "0 0% 98%",
  destructive: "0 62.8% 30.6%",
  "destructive-fg": "0 0% 98%",
  muted: "240 3.7% 15.9%",
  "muted-fg": "240 5% 64.9%",
  border: "240 3.7% 15.9%",
  input: "240 3.7% 15.9%",
  ring: "240 4.9% 83.9%",
  ...FONT_BASE,
};

// The demo platform's manifest (vibe-capable v2). Brand seeds (primary/accent/neutral), radius,
// density, and typography are CUSTOMIZABLE; the platform LOCKS its error-state color (destructive).
// Contrast tier AA + a WCAG 2.2 §2.5.8 target-size floor (inherited from SHADCN_CAN_V2): "compact"
// density is refused as too cramped. allowedFonts is the self-hosted registry (see src/index.css).
export const DEMO_MANIFEST: AppManifest = AppManifest.parse({
  ...SHADCN_CAN_V2,
  appId: "demo",
  modes: { allowed: ["light", "dark"], default: "light", selectors: { light: ":root", dark: ".dark" } },
  base: { light: { ...SHADCN_CAN_V2.base.light, ...FONT_BASE }, dark: SHADCN_DARK },
  invariants: {
    ...SHADCN_CAN_V2.invariants,
    locks: ["destructive"],
    allowedFonts: [
      { id: "sans", stack: "ui-sans-serif, system-ui, sans-serif" },
      { id: "geist-sans", stack: '"Geist", ui-sans-serif, system-ui, sans-serif' },
      { id: "geist-mono", stack: '"Geist Mono", ui-monospace, SFMono-Regular, monospace' },
      { id: "ibm-plex-mono", stack: '"IBM Plex Mono", ui-monospace, monospace' },
      { id: "plex-serif", stack: '"IBM Plex Serif", ui-serif, Georgia, serif' },
    ],
    // legibilityFloor { minTapTarget: 24, controlContentPx: 14 } is inherited from SHADCN_CAN_V2.
  },
});
