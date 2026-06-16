import { AppManifestSchema, type AppManifest } from "@invariance/schema";
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
import { loadProject, extractColors } from "./analysis";
import type { RepoScan } from "./scan";

const COLOR_VALUE = /^#[0-9a-fA-F]{3,8}$|^(rgb|hsl|oklch|oklab|lab|lch)\(/i;

export function kindFromName(name: string): ColorObservation["kind"] {
  const n = name.toLowerCase();
  if (/border|ring|divide|outline|stroke/.test(n)) return "border";
  if (/text|fg|foreground|ink|copy|label/.test(n)) return "text";
  return "bg"; // bg / surface / accent / brand / primary / ...
}

const emptyTailwind = () => ({
  colors: new Map<string, string>(),
  fonts: new Map<string, string>(),
  spacing: new Map<string, string>(),
  loaded: false,
});

/**
 * Observe design colours from a repo: regex-scanned CSS custom properties plus
 * AST-extracted inline-style / Tailwind colours in JSX. Best-effort — an AST
 * failure never breaks init (the CSS-token observations stand on their own).
 */
export function observeColors(scan: RepoScan, root: string): ColorObservation[] {
  const obs: ColorObservation[] = [];
  for (const t of scan.cssTokens) {
    const v = t.value.trim();
    if (COLOR_VALUE.test(v)) obs.push({ hex: v, kind: kindFromName(t.name) });
  }
  try {
    const project = loadProject(root);
    const tw = emptyTailwind();
    for (const sf of project.getSourceFiles()) {
      for (const ov of extractColors(sf, tw)) {
        if (ov.role === "bg" || ov.role === "text" || ov.role === "border") {
          obs.push({ hex: ov.value, kind: ov.role });
        }
      }
    }
  } catch {
    // AST analysis is best-effort; CSS-token observations already seed inference.
  }
  return obs;
}

function chromaBucket(c: number): StyleSpec["accentChroma"] {
  if (c > 0.18) return "vivid";
  if (c > 0.11) return "medium";
  return "muted";
}

const DEFAULT_FONT_PAIRING =
  FONT_PAIRINGS.find((p) => /inter|sans|grotesk|system|neue|geist/.test(p.id))?.id ??
  FONT_PAIRINGS[0]!.id;

/**
 * Infer a valid default StyleSpec from clustered observed colours. We can read
 * mode (surface lightness) and the accent hue/chroma; every other field takes a
 * sensible default. The result is schema-validated, so compileTheme always
 * succeeds — init emits a coherent, compiler-ready starting theme that the
 * Designer refines on the first real prompt.
 */
export function inferStyleSpec(observations: ColorObservation[]): StyleSpec {
  const { roles } = clusterColors(observations);
  const surface = roles["--inv-surface-0"];
  const accent = roles["--inv-accent"];
  const surfaceL = surface ? oklchOf(surface)?.l : undefined;
  const accentOk = accent ? oklchOf(accent) : null;

  const mode: StyleSpec["mode"] = surfaceL != null && surfaceL < 0.5 ? "dark" : "light";
  const accentHue = accentOk && accentOk.h != null ? Math.round(accentOk.h) : 250;
  const accentChroma = accentOk ? chromaBucket(accentOk.c) : "medium";

  return StyleSpecSchema.parse({
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
    rationale: "Inferred from the app's observed colours by invariance init.",
  });
}

function roleTokenKind(token: string): "color" | "typography" | "radius" | "shadow" | "spacing" | "other" {
  if (/font/.test(token)) return "typography";
  if (/radius/.test(token)) return "radius";
  if (/shadow/.test(token)) return "shadow";
  if (/space|sidebar-w|card-w|card-aspect|hero|section-gap|density/.test(token)) return "spacing";
  if (/surface|text|accent|border|ring/.test(token)) return "color";
  return "other";
}

/**
 * Declare the 38 role tokens (with their compiled default values) in the
 * manifest's designTokens, skipping any name the app already declares. This is
 * what makes an app compiler-ready: the design engine themes via these tokens,
 * and the verifier accepts a theme bundle's token-override ops.
 */
export function declareRoleTokens(manifest: AppManifest, roles: Record<string, string>): AppManifest {
  const existing = new Set(manifest.designTokens.map((t) => t.name));
  const added = ROLE_TOKENS.filter((name) => !existing.has(name) && roles[name]).map((name) => ({
    name,
    kind: roleTokenKind(name),
    value: roles[name]!,
    description: "invariance role token (compiler-managed)",
  }));
  return AppManifestSchema.parse({ ...manifest, designTokens: [...manifest.designTokens, ...added] });
}

/** Infer the StyleSpec for a repo and compile it into the 38 role-token values. */
export function inferDesign(scan: RepoScan, root: string): { styleSpec: StyleSpec; roles: Record<string, string> } {
  const styleSpec = inferStyleSpec(observeColors(scan, root));
  const { roles } = compileTheme(styleSpec);
  return { styleSpec, roles };
}
