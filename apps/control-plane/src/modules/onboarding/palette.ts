import {
  clusterColors,
  compileTheme,
  oklchOf,
  StyleSpecSchema,
  FONT_PAIRINGS,
  ROLE_TOKENS,
  type StyleSpec,
  type ColorObservation,
} from "@invariance/design/server";
import type { OnboardingToken, OnboardingFont } from "@invariance/schema";

/** Role tokens surfaced as editable swatches in the wizard. */
const SALIENT = new Set([
  "--inv-accent",
  "--inv-surface-0",
  "--inv-surface-1",
  "--inv-surface-2",
  "--inv-text",
  "--inv-text-muted",
  "--inv-border",
]);

const DEFAULT_FONT_PAIRING =
  FONT_PAIRINGS.find((p) => /inter|sans|grotesk|system|neue|geist/.test(p.id))?.id ??
  FONT_PAIRINGS[0]!.id;

function chromaBucket(c: number): StyleSpec["accentChroma"] {
  if (c > 0.18) return "vivid";
  if (c > 0.11) return "medium";
  return "muted";
}

/**
 * Infer a coherent default StyleSpec from clustered observed colors, then
 * compile it into the full role-token map. Mirrors the CLI's `inferStyleSpec`
 * so first render is seeded from the app's own palette.
 */
export function seedRoles(observations: ColorObservation[]): {
  styleSpec: StyleSpec;
  roles: Record<string, string>;
} {
  const { roles: clustered } = clusterColors(observations);
  const surface = clustered["--inv-surface-0"];
  const accent = clustered["--inv-accent"];
  const surfaceL = surface ? oklchOf(surface)?.l : undefined;
  const accentOk = accent ? oklchOf(accent) : null;

  const mode: StyleSpec["mode"] = surfaceL != null && surfaceL < 0.5 ? "dark" : "light";
  const accentHue = accentOk && accentOk.h != null ? Math.round(accentOk.h) : 250;
  const accentChroma = accentOk ? chromaBucket(accentOk.c) : "medium";

  const styleSpec = StyleSpecSchema.parse({
    mode,
    accentHue,
    accentChroma,
    neutralTint: 0,
    neutralTintStrength: "subtle",
    contrast: "standard",
    fontPairing: DEFAULT_FONT_PAIRING,
    radius: "subtle",
    shadow: "subtle",
    density: "standard",
    borderWeight: "standard",
    typography: "standard",
    framing: "standard",
    rationale: "Inferred from the app's observed palette by onboarding.",
  });

  const { roles } = compileTheme(styleSpec);
  return { styleSpec, roles };
}

function kindOf(token: string): OnboardingToken["kind"] {
  if (/font/.test(token)) return "typography";
  if (/radius/.test(token)) return "radius";
  if (/shadow/.test(token)) return "shadow";
  if (/space|sidebar-w|card-w|card-aspect|hero|section-gap|density|gap/.test(token)) return "spacing";
  return "color";
}

/** Build the wizard's token list: every compiled role token, salient ones flagged. */
export function buildTokens(
  roles: Record<string, string>,
  usageByHex: Map<string, number>,
): OnboardingToken[] {
  return ROLE_TOKENS.filter((name) => roles[name]).map((name) => {
    const value = roles[name]!;
    return {
      role: name,
      value,
      kind: kindOf(name),
      locked: false,
      usage: usageByHex.get(value.toLowerCase()) ?? 0,
      salient: SALIENT.has(name),
    };
  });
}

/** Build the wizard's font list from observed families (fallback: the default pairing). */
export function buildFonts(families: Set<string>): OnboardingFont[] {
  const out: OnboardingFont[] = [];
  for (const family of families) {
    const f = family.toLowerCase();
    const role: OnboardingFont["role"] = /mono|code|consol/.test(f)
      ? "mono"
      : /display|head|serif/.test(f)
        ? "heading"
        : "body";
    out.push({ family, role, usage: 1 });
  }
  if (out.length === 0) {
    out.push({ family: "system-ui, sans-serif", role: "body", usage: 0 });
  }
  return out;
}
