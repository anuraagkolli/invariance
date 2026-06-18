// packages/theming/src/manifest/schema.ts
import { z } from "zod";

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
  });
// NOTE: .superRefine(...) is added in Task 9 (cross-field integrity).

export type AppManifest = z.infer<typeof AppManifest>;
