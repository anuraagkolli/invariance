// packages/theming/src/spec/style-spec.ts
import { z } from "zod";
import { OklchColor } from "./oklch.js";
import type { FontStackId as FontStackIdType } from "../roles/types.js";

// The schema's compile-time upper bound for the radius leaf. Plan 02 may tighten emitted radius via the
// profile but never relaxes this schema bound.
export const MAX_RADIUS_PX = 24;

// A font is an allowlist INDEX, never free text. This leaf only validates the string SHAPE; the
// semantic check (∈ manifest.allowedFonts) happens in parseSpec with manifest context.
export const FontStackId: z.ZodType<FontStackIdType> = z.string().min(1);

// THE WALL schema. Closed (.strict() — unknown keys rejected). Leaves .optional().nullable():
//   undefined = "not in this delta" (absent); null = removal sentinel ("revert to app default").
// The group objects are .optional() but NOT nullable (the sentinel is leaf-only).
export const StyleSpec = z
  .object({
    colors: z
      .object({
        primary: OklchColor.optional().nullable(),
        accent: OklchColor.optional().nullable(),
        neutral: OklchColor.optional().nullable(), // seeds the surface/line ramp; not an output var
        destructive: OklchColor.optional().nullable(),
      })
      .strict()
      .optional(),
    radius: z.number().min(0).max(MAX_RADIUS_PX).optional().nullable(),
    density: z.enum(["compact", "comfortable", "spacious"]).optional().nullable(),
    typography: z
      .object({
        display: FontStackId.optional().nullable(),
        body: FontStackId.optional().nullable(),
        mono: FontStackId.optional().nullable(),
      })
      .strict()
      .optional(),
    mode: z.enum(["light", "dark", "both"]).optional().nullable(),
  })
  .strict();

export type StyleSpec = z.infer<typeof StyleSpec>;
