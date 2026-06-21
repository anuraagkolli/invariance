import { AppManifest, SHADCN_CAN } from "@invariance/theming";

export { SHADCN_CAN };

// ── Canonical draft input cases (all wall-valid against SHADCN_CAN: none touch the
//    locked `primary` seed; fonts use the "sans" allowlist id; radius ≤ 24). ──
export const DRAFTS: Array<{ name: string; json: Record<string, unknown> }> = [
  { name: "empty", json: {} },
  { name: "destructive-recolor", json: { colors: { destructive: "oklch(0.55 0.2 20)" } } },
  { name: "neutral-resurface", json: { colors: { neutral: "oklch(0.45 0.02 250)" } } },
  { name: "radius-bump", json: { radius: 12 } },
  {
    name: "full-rebrand",
    json: { colors: { accent: "oklch(0.7 0.12 160)", destructive: "oklch(0.55 0.22 25)" } },
  },
  { name: "density-font-mode", json: { density: "compact", typography: { body: "sans" }, mode: "dark" } },
  { name: "accent-only", json: { colors: { accent: "oklch(0.6 0.15 280)" } } },
  { name: "radius-max", json: { radius: 24 } },
];

// ── A two-mode manifest fixture. SHADCN_CAN ships light-only; to exercise the dark
//    ladder and "both modes" contrast we add the canonical shadcn "zinc" dark base
//    (designed to clear AA). AppManifest.parse runs refBasePassesTier, so an invalid
//    dark base would throw here (a fixture error, not an engine bug). ──
const SHADCN_DARK_BASE: Record<string, string> = {
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

export const TWO_MODE_CAN = AppManifest.parse({
  ...SHADCN_CAN,
  appId: "shadcn-can-twomode",
  modes: { allowed: ["light", "dark"], default: "light", selectors: { light: ":root", dark: ".dark" } },
  base: { light: SHADCN_CAN.base.light, dark: SHADCN_DARK_BASE },
});

// ── A no-locks clone, so `primary` may be re-seeded and its closure re-derived (the
//    transitive re-derivation test needs primary to actually move). ──
export const NO_LOCKS_CAN = AppManifest.parse({
  ...SHADCN_CAN,
  appId: "shadcn-can-nolocks",
  invariants: { ...SHADCN_CAN.invariants, locks: [] },
});
