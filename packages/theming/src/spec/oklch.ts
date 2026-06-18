// packages/theming/src/spec/oklch.ts
import { z } from "zod";
import { converter, clampChroma } from "culori";

// The parsed/typed OKLCH form that flows downstream. l ∈ [0,1], c ≥ 0 (clamped to cap), h ∈ [0,360).
export type Oklch = { l: number; c: number; h: number };

// v1 chroma cap. The manifest carries the authoritative per-app cap; this is the schema-level guard so
// no value parses past the wall over-saturated. Compiler/verifier re-check against manifest.chromaCap.
export const CHROMA_CAP_DEFAULT = 0.4;

const toOklch = converter("oklch");

// parse-don't-validate: accept a CSS color string, parse to OKLCH, clamp chroma on the way in.
// A breakout string fails culori's parser → undefined → zod rejection. The dangerous string never
// advances past the wall as a typed value. The ZodType<Output, Def, Input> three-arg annotation pins
// input=string / output=Oklch so the ZodEffects from .transform() is assignable to the exported type.
export const OklchColor: z.ZodType<Oklch, z.ZodTypeDef, string> = z
  .string()
  .transform((raw, ctx) => {
    let parsed;
    try {
      parsed = toOklch(raw);
    } catch {
      parsed = undefined;
    }
    if (!parsed) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `unparseable color: ${raw}` });
      return z.NEVER;
    }
    // clampChroma keeps the color in-gamut, then re-run the oklch converter so we read channels off a
    // typed Oklch object — culori types clampChroma's return as the broad `Color` union (no l/c/h on every
    // member), which would not typecheck under strict; toOklch narrows it back to { mode, l, c, h? }.
    const clampedOklch = toOklch(clampChroma(parsed, "oklch"));
    if (!clampedOklch) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `unparseable color: ${raw}` });
      return z.NEVER;
    }
    const l = clampedOklch.l ?? 0;
    // enforce the v1 cap on top of the gamut clamp.
    const c = Math.min(clampedOklch.c ?? 0, CHROMA_CAP_DEFAULT);
    const h = Number.isFinite(clampedOklch.h) ? (clampedOklch.h as number) : 0; // achromatic → 0 (NaN-safe)
    return { l, c, h } satisfies Oklch;
  });
