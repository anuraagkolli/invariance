import { z } from "zod";

export const VariableRoleSchema = z.object({
  /** Design role this variable drives, e.g. "accent", "surface-0", "text-primary". */
  role: z.string().min(1),
  /** CSS selector scope where the variable is defined. */
  scope: z.string().min(1).default(":root"),
  /** Brand-locked: customization may never change this variable. */
  locked: z.boolean().default(false),
});
export type VariableRole = z.infer<typeof VariableRoleSchema>;

/** Vendor CSS variable name (e.g. "--primary") -> the design role it drives. */
export const VariableRoleMapSchema = z.record(VariableRoleSchema);
export type VariableRoleMap = z.infer<typeof VariableRoleMapSchema>;

/**
 * Developer-tunable "look" invariants for an app — the runtime layer over the
 * manifest's code-defined design-constraint defaults. Stored control-plane-side
 * and edited in the console; the design plane reads it and merges it into the
 * live config. Shape mirrors Nebula's former local DevConfigOverlay.
 */
export const DesignConfigSchema = z.object({
  /** route -> customization level 0..4 */
  pageLevels: z.record(z.number().int().min(0).max(4)).optional(),
  /** hex that locks --inv-accent; null/absent = unlocked */
  accentLock: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  /** m.slot section names users may not hide/remove */
  lockedSections: z.array(z.string().min(1)).optional(),
  /** caps accent OKLCH chroma (0.10–0.25) */
  chromaCap: z.number().min(0.1).max(0.25).optional(),
  /** minimum WCAG contrast ratio (1–21) */
  contrastFloor: z.number().min(1).max(21).optional(),
  /** Onboarding output: the vendor's CSS variables, each bound to a design role. */
  variableRoleMap: VariableRoleMapSchema.optional(),
  /** Modes customization may use (subset of light/dark). */
  allowedModes: z.array(z.enum(["light", "dark"])).optional(),
});
export type DesignConfig = z.infer<typeof DesignConfigSchema>;
