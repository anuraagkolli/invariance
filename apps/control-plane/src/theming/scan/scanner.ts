// apps/control-plane/src/theming/scan/scanner.ts
import type { AppManifest, ScanPayload, RoleId, VarName, ContrastTier } from "@invariance/theming";
import { getRoleGraph, VOCAB_VERSION } from "@invariance/theming";
import { classifyRole } from "./classify-role.js";
import { inferEmit } from "./infer-emit.js";

export type ScannerOptions = {
  appId: string;
  vocabVersion: string;
  profileVersion: string;
  contrastTier: ContrastTier;
};

export type CoverageReason =
  | "color_mix"
  | "opaque_sheet"
  | "low_confidence_inference"
  | "ambiguous_role";

export type CoverageReport = {
  classified: Array<{ name: VarName; role: RoleId; confidence: "confirmed" | "inferred" }>;
  needsConfirmation: Array<{ name: VarName; reason: CoverageReason }>;
  unmapped: VarName[];
  opaqueSheetCount: number;
};

export type ScanResult = { manifest: AppManifest; coverage: CoverageReport };

const DEFAULT_CHROMA_CAP = 0.4;

/**
 * Canonical var-name → RoleId binding for iv-roles-1 (shadcn naming). The scan's
 * source of truth for which role a `--*` var IS. Vars not in this table classify
 * as `unmapped`.
 */
const NAME_TO_ROLE: Record<string, RoleId> = {
  "--primary": "primary",
  "--accent": "accent",
  "--destructive": "destructive",
  "--background": "background",
  "--card": "card",
  "--popover": "popover",
  "--muted": "muted",
  "--secondary": "secondary",
  "--border": "border",
  "--input": "input",
  "--ring": "ring",
  "--foreground": "foreground",
  "--card-foreground": "card-fg",
  "--popover-foreground": "popover-fg",
  "--secondary-foreground": "secondary-fg",
  "--primary-foreground": "primary-fg",
  "--accent-foreground": "accent-fg",
  "--destructive-foreground": "destructive-fg",
  "--muted-foreground": "muted-fg",
  "--radius": "radius",
};

function dominantDeclaration(decls: ScanPayload["variables"][number]["declarations"]) {
  // Prefer the light declaration (the canvas); else the first.
  return decls.find((d) => d.mode === "light") ?? decls[0]!;
}

function radiusToNumber(raw: string): number {
  const m = /(-?\d*\.?\d+)/.exec(raw.trim());
  return m ? Number(m[1]) : 0;
}

export function runScanner(payload: ScanPayload, opts: ScannerOptions): ScanResult {
  const vocabVersion = opts.vocabVersion || VOCAB_VERSION;
  const graph = getRoleGraph(vocabVersion);
  const opaqueDowngrade = payload.opaqueSheets.length > 0;

  const variables: AppManifest["variables"] = {};
  const baseLight: Record<string, string> = {};
  const baseDark: Record<string, string> = {};
  let sawDark = false;
  let darkSelector: string | undefined;
  let lightSelector = ":root";

  const classified: CoverageReport["classified"] = [];
  const needsConfirmation: CoverageReport["needsConfirmation"] = [];
  const unmapped: VarName[] = [];

  for (const v of payload.variables) {
    const role = NAME_TO_ROLE[v.name];
    const dom = dominantDeclaration(v.declarations);
    // Parse gate: a color-named var must actually parse as a color leaf (classifyRole gate).
    const kind = classifyRole(dom.rawValue, dom.heldFormat, graph);
    if (!role || !kind) {
      unmapped.push(v.name);
      continue;
    }

    // Record base[mode][role] verbatim (the canvas / fail-open target).
    for (const d of v.declarations) {
      if (d.mode === "light") {
        baseLight[role] = d.rawValue;
        lightSelector = d.selector || lightSelector;
      } else if (d.mode === "dark") {
        baseDark[role] = d.rawValue;
        sawDark = true;
        darkSelector = d.selector || darkSelector;
      }
    }

    const emitInf = inferEmit({
      consumptionSites: payload.consumption[v.name] ?? [],
      heldFormat: dom.heldFormat,
      opaqueDowngrade,
    });

    variables[v.name] = { role, emit: emitInf.emit, confidence: emitInf.confidence };
    classified.push({ name: v.name, role, confidence: emitInf.confidence });
    if (emitInf.confidence === "inferred" && emitInf.reason) {
      needsConfirmation.push({ name: v.name, reason: emitInf.reason });
    }
  }

  // ---- Modes
  const allowed: ("light" | "dark")[] = sawDark ? ["light", "dark"] : ["light"];
  const selectors: { light: string; dark?: string } = { light: lightSelector };
  if (sawDark) selectors.dark = darkSelector ?? ".dark";

  // ---- defaultSeeds (Designer baseline)
  const radiusRaw = baseLight["radius"];
  const defaultSeeds: AppManifest["defaultSeeds"] = {
    colors: {
      primary: baseLight["primary"] ?? "",
      accent: baseLight["accent"] ?? "",
      neutral: baseLight["background"] ?? "", // neutral seeds the surface ramp; capture background's held
      destructive: baseLight["destructive"] ?? "",
    },
    radius: radiusRaw !== undefined ? radiusToNumber(radiusRaw) : 0,
    density: "comfortable",
  };

  const manifest: AppManifest = {
    appId: opts.appId,
    manifestVersion: 1,
    vocabVersion,
    profileVersion: opts.profileVersion,
    variables,
    modes: { allowed, default: "light", selectors },
    base: sawDark ? { light: baseLight, dark: baseDark } : { light: baseLight },
    defaultSeeds,
    invariants: {
      contrastTier: opts.contrastTier,
      chromaCap: DEFAULT_CHROMA_CAP,
      locks: [],
      allowedFonts: [],
    },
  };

  return {
    manifest,
    coverage: {
      classified,
      needsConfirmation,
      unmapped,
      opaqueSheetCount: payload.opaqueSheets.length,
    },
  };
}
