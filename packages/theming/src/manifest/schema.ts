// packages/theming/src/manifest/schema.ts
import { z } from "zod";
import { wcagContrast, converter } from "culori";
import { getRoleGraph, classifySeedOrDerived } from "../roles/graph.js";
import { requiredContrast } from "../roles/contrast.js";

// Culori parser used to check parseability before wcagContrast (which throws on unparseable input).
const _toOklch = converter("oklch");

// The format-contract emit struct (§5/§6). Space includes the literal null member.
export type Shape = "triple" | "function" | "raw" | "number";
export type Space = "hsl" | "rgb" | "oklch" | null;
export type EmitContract = { shape: Shape; space: Space; precision: number };

const ShapeSchema = z.enum(["triple", "function", "raw", "number"]);
const SpaceSchema = z.union([z.enum(["hsl", "rgb", "oklch"]), z.null()]);

export const AppManifest = z
  .object({
    appId: z.string(),
    manifestVersion: z.number(),
    vocabVersion: z.string(), // pins the role graph — "iv-roles-1"
    profileVersion: z.string(), // pins the ramp profile

    variables: z.record(
      z.string(), // VarName
      z.object({
        role: z.string(), // RoleId ∈ the pinned vocab's roles
        emit: z.object({ shape: ShapeSchema, space: SpaceSchema, precision: z.number() }),
        confidence: z.enum(["confirmed", "inferred"]),
      }),
    ),

    modes: z.object({
      allowed: z.array(z.enum(["light", "dark"])),
      default: z.enum(["light", "dark"]),
      selectors: z.object({ light: z.string(), dark: z.string().optional() }),
    }),

    base: z.object({
      light: z.record(z.string(), z.string()),
      dark: z.record(z.string(), z.string()).optional(),
    }),

    defaultSeeds: z.object({
      colors: z.object({
        primary: z.string(),
        accent: z.string(),
        neutral: z.string(),
        destructive: z.string(),
      }),
      radius: z.number(),
      density: z.enum(["compact", "comfortable", "spacious"]),
      // Optional in v2+ manifests; existing v1 fixtures that omit them still parse.
      shadow: z.enum(["flat", "soft", "elevated"]).optional(),
      borderWeight: z.enum(["hairline", "standard", "heavy"]).optional(),
    }),

    invariants: z.object({
      contrastTier: z.enum(["AA", "AAA"]),
      chromaCap: z.number(),
      locks: z.array(z.string()), // (SeedId | RoleId)[]
      allowedFonts: z.array(z.object({ id: z.string(), stack: z.string() })),
    }),
  })
  .superRefine((m, ctx) => {
    // Resolve the pinned graph once; an unknown vocab version is itself a hard failure.
    let graph;
    try {
      graph = getRoleGraph(m.vocabVersion);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vocabVersion"], message: `unknown vocab version: ${m.vocabVersion}` });
      return;
    }
    const roleSet = new Set(Object.keys(graph.roles));
    const seedSet = new Set(graph.seeds);

    // refRolesInVocab — variables[*].role and locks[*] ∈ the pinned vocab's role/seed set.
    for (const [varName, v] of Object.entries(m.variables)) {
      if (!roleSet.has(v.role)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variables", varName, "role"], message: `role not in vocab: ${v.role}` });
      }
    }
    for (let i = 0; i < m.invariants.locks.length; i++) {
      const lock = m.invariants.locks[i];
      if (lock !== undefined && !roleSet.has(lock) && !seedSet.has(lock)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["invariants", "locks", i], message: `lock does not resolve: ${lock}` });
      }
    }

    // refModesWellFormed — default ∈ allowed ⊆ {light,dark}.
    if (!m.modes.allowed.includes(m.modes.default)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["modes", "default"], message: `default mode not in allowed` });
    }

    // refDefaultSeedsComplete — the object schema already requires all four seed colors + radius +
    // density. The remaining "covers every seed" obligation (mode/typography picks have no value
    // payload in defaultSeeds by design) is satisfied structurally; nothing further to check here.

    // refFontsPresentIfTypographyMapped — allowedFonts non-empty if any typography role is mapped.
    const typographyRoles = new Set(["font-display", "font-body", "font-mono"]);
    const anyTypographyMapped = Object.values(m.variables).some((v) => typographyRoles.has(v.role));
    if (anyTypographyMapped && m.invariants.allowedFonts.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["invariants", "allowedFonts"], message: `typography role mapped but allowedFonts is empty` });
    }

    // refEmitSpaceConsistent — triple/function require non-null space; raw/number require null space.
    for (const [varName, v] of Object.entries(m.variables)) {
      const { shape, space } = v.emit;
      const needsSpace = shape === "triple" || shape === "function";
      if (needsSpace && space === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variables", varName, "emit", "space"], message: `${shape} requires a non-null space` });
      }
      if (!needsSpace && space !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variables", varName, "emit", "space"], message: `${shape} requires a null space` });
      }
    }

    // refPerModeSelectorPresent — every allowed mode has its selector recorded.
    for (const mode of m.modes.allowed) {
      if (m.modes.selectors[mode] === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["modes", "selectors", mode], message: `allowed mode "${mode}" has no selector` });
      }
    }

    // refLocksResolveAndPinnable — seed locks need no base entry; derived-role locks need base[mode][role]
    // in every allowed mode.
    for (let i = 0; i < m.invariants.locks.length; i++) {
      const lock = m.invariants.locks[i];
      if (lock === undefined) continue;
      if (!roleSet.has(lock) && !seedSet.has(lock)) continue; // already flagged by refRolesInVocab
      if (classifySeedOrDerived(graph, lock) === "derived") {
        for (const mode of m.modes.allowed) {
          const baseForMode = mode === "dark" ? m.base.dark : m.base.light;
          if (!baseForMode || baseForMode[lock] === undefined) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["invariants", "locks", i], message: `derived-role lock "${lock}" has no base[${mode}] pin` });
          }
        }
      }
    }

    // refBasePassesTier — THE §3 gate, blocking. ∀ contrastPair, ∀ allowed mode:
    // ratio(base[mode][fg], base[mode][bg]) ≥ requiredContrast(tier, category).
    //
    // base is stored emit-verbatim (§5 contract). For the shadcn path that is a bare HSL
    // triple like "0 0% 100%", which culori cannot parse directly. We reconstruct a
    // parseable color string from each variable's emit contract before calling wcagContrast.
    //
    // Build a role → emit lookup by inverting m.variables.
    const roleEmit = new Map<string, { shape: Shape; space: Space }>();
    for (const v of Object.values(m.variables)) {
      if (!roleEmit.has(v.role)) {
        roleEmit.set(v.role, { shape: v.emit.shape, space: v.emit.space });
      }
    }

    // Reconstruct a raw base value into a culori-parseable CSS color string.
    // Strategy: try the value as-is first (handles hex, named, function-form values that culori can
    // parse directly). If that fails, reconstruct using the variable's emit contract. This is the
    // conservative safe path — it handles both well-formed hex test fixtures and real shadcn-emitted
    // bare HSL triples ("0 0% 100%") without breaking pre-existing fixtures.
    function toParseableColor(raw: string, role: string): string {
      // Fast path: culori can already parse it (hex, named color, or CSS function like "hsl(...)").
      try {
        if (_toOklch(raw) !== undefined) {
          return raw;
        }
      } catch {
        // fall through to reconstruction
      }
      // Slow path: reconstruct via emit contract.
      const emit = roleEmit.get(role);
      if (!emit) {
        // No emit info and raw is not parseable — return raw and let the caller handle the failure.
        return raw;
      }
      const { shape, space } = emit;
      if (shape === "triple" && space !== null) {
        // e.g. "0 0% 100%" → "hsl(0 0% 100%)"
        return `${space}(${raw})`;
      }
      // shape === "raw" | "function": already should be parseable (handled by fast path above).
      // shape === "number": not a color; shouldn't appear in contrastPairs — return raw as guard.
      return raw;
    }

    for (const mode of m.modes.allowed) {
      const baseForMode = mode === "dark" ? m.base.dark : m.base.light;
      if (!baseForMode) continue; // a missing dark base is surfaced elsewhere; skip the contrast pass
      for (const pair of graph.contrastPairs) {
        const fgRaw = baseForMode[pair.fg];
        const bgRaw = baseForMode[pair.bg];
        if (fgRaw === undefined || bgRaw === undefined) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["base", mode], message: `base[${mode}] missing ${fgRaw === undefined ? pair.fg : pair.bg} for contrast pair` });
          continue;
        }
        const fgColor = toParseableColor(fgRaw, pair.fg);
        const bgColor = toParseableColor(bgRaw, pair.bg);
        let ratio: number;
        try {
          ratio = wcagContrast(fgColor, bgColor);
          // culori returns NaN or a non-finite number when a value cannot be parsed
          if (!isFinite(ratio)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["base", mode, pair.fg],
              message: `base ${mode} (${pair.fg} on ${pair.bg}) could not parse color values for contrast check`,
            });
            continue;
          }
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["base", mode, pair.fg],
            message: `base ${mode} (${pair.fg} on ${pair.bg}) could not parse color values for contrast check`,
          });
          continue;
        }
        const floor = requiredContrast(m.invariants.contrastTier, pair.category);
        if (!(ratio >= floor)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["base", mode, pair.fg],
            message: `base ${mode} (${pair.fg} on ${pair.bg}) contrast ${ratio.toFixed(2)} < required ${floor} for ${pair.category}`,
          });
        }
      }
    }
  });

export type AppManifest = z.infer<typeof AppManifest>;
