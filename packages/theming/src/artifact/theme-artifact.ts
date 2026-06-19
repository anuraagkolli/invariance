// packages/theming/src/artifact/theme-artifact.ts
import { z } from "zod";
import type { VarName } from "./deps.js";

// VarName is a CSS custom-property name including the leading "--".
const VarNameKey = z.string() as z.ZodType<VarName>;

export const ThemeArtifact = z.object({
  schemaVersion: z.number(),
  vocabVersion: z.string(),
  profileVersion: z.string(),
  appId: z.string(), // NO tenant — pure value keyed by its own content (§7.1)
  modes: z.object({
    light: z.object({ selector: z.string(), vars: z.record(VarNameKey, z.string()) }),
    dark: z
      .object({ selector: z.string(), vars: z.record(VarNameKey, z.string()) })
      .optional(),
  }),
  meta: z
    .object({
      verifierReport: z.unknown(),
      contrastFloor: z.unknown(),
      chromaCap: z.number(),
    })
    .passthrough(), // applier ignores meta; eyes-on/debug fields ride through
});

export type ThemeArtifact = z.infer<typeof ThemeArtifact>;
