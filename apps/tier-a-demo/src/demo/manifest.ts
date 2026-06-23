import { AppManifest, SHADCN_CAN } from "@invariance/theming";

// Standard shadcn "zinc" dark base — AA-designed (same values the verification suite validated).
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
};

// The demo platform's manifest: brand seeds (primary/accent/neutral) are CUSTOMIZABLE; the platform
// LOCKS its error-state color (destructive); contrast tier AA (the realistic standard — the standard
// base already clears it, so refBasePassesTier accepts this without an AAA base).
export const DEMO_MANIFEST: AppManifest = AppManifest.parse({
  ...SHADCN_CAN,
  appId: "demo",
  modes: { allowed: ["light", "dark"], default: "light", selectors: { light: ":root", dark: ".dark" } },
  base: { light: SHADCN_CAN.base.light, dark: SHADCN_DARK },
  invariants: { ...SHADCN_CAN.invariants, locks: ["destructive"] },
});
