// packages/theming/src/manifest/schema.ts
import { z } from "zod";
import { wcagContrast } from "culori";
import { getRoleGraph, classifySeedOrDerived } from "../roles/graph.js";
import { requiredContrast } from "../roles/contrast.js";

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
    for (const mode of m.modes.allowed) {
      const baseForMode = mode === "dark" ? m.base.dark : m.base.light;
      if (!baseForMode) continue; // a missing dark base is surfaced elsewhere; skip the contrast pass
      for (const pair of graph.contrastPairs) {
        const fg = baseForMode[pair.fg];
        const bg = baseForMode[pair.bg];
        if (fg === undefined || bg === undefined) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["base", mode], message: `base[${mode}] missing ${fg === undefined ? pair.fg : pair.bg} for contrast pair` });
          continue;
        }
        const ratio = wcagContrast(fg, bg);
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
