import { z } from "zod";
import { HookPhaseSchema, SemverSchema } from "./manifest";

export const UiOpSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("token-override"),
    token: z.string().min(1),
    value: z.string().min(1),
  }),
  z.object({
    type: z.literal("style-rule"),
    /** Scoped at runtime under the overlay root; never applied globally as-is. */
    selector: z.string().min(1),
    declarations: z
      .record(z.string())
      .refine((d) => Object.keys(d).length > 0, "style-rule needs at least one declaration"),
  }),
  z.object({
    type: z.literal("slot-override"),
    componentId: z.string().min(1),
    slot: z.string().min(1),
    /** Serialized declarative content; sanitized by the client runtime before render. */
    content: z.string(),
  }),
]);
export type UiOp = z.infer<typeof UiOpSchema>;

export const HookModuleSchema = z.object({
  id: z.string().min(1),
  trigger: z.object({
    endpointId: z.string().min(1),
    phase: HookPhaseSchema,
  }),
  language: z.literal("js"),
  /** Executed only inside the sandboxed hook runtime, never eval'd directly. */
  source: z.string().min(1),
});
export type HookModule = z.infer<typeof HookModuleSchema>;

export const CapabilityAccessSchema = z.object({
  endpointId: z.string().min(1),
  /** Dot paths; omitted means the whole body at that endpoint. */
  fields: z.array(z.string().min(1)).optional(),
});

export const CapabilityManifestSchema = z.object({
  reads: z.array(CapabilityAccessSchema).default([]),
  writes: z.array(CapabilityAccessSchema).default([]),
  budgets: z
    .object({
      cpuMs: z.number().int().positive().max(1000),
      memMb: z.number().int().positive().max(128),
    })
    .default({ cpuMs: 50, memMb: 32 }),
});
export type CapabilityManifest = z.infer<typeof CapabilityManifestSchema>;

export const ManifestBindingSchema = z.object({
  /** Exact app-manifest version this bundle was verified against. */
  appManifestVersion: SemverSchema,
});

/**
 * Design provenance for theme mods: the StyleSpec the design engine produced
 * and the compiler that expanded it into the token-override uiOps. Carried so
 * the console can show intent ("warm, editorial, high-contrast") instead of 38
 * hex strings, and so re-fix can recompile under a new manifest without
 * re-prompting. Optional — only theme mods carry it. `styleSpec` is kept
 * schema-loose here (validated by the design engine, not this package) so the
 * platform schema stays independent of @invariance/design-schema. CDN-safe:
 * 12 enum/number fields + a rationale string, no PII.
 */
export const BundleDesignSchema = z.object({
  styleSpec: z.record(z.unknown()),
  compiledBy: z.string().min(1),
  warnings: z.array(z.string()).default([]),
});
export type BundleDesign = z.infer<typeof BundleDesignSchema>;

/**
 * A Mod Bundle is the only artifact runtimes execute: declarative UI ops plus
 * sandboxed hooks, with an explicit capability manifest. Bundles are immutable
 * once signed; a new revision supersedes via the registry pointer. The
 * originating user prompt is deliberately NOT part of the bundle (it may
 * contain PII and bundles are CDN-distributed); prompts live control-plane-side.
 */
export const ModBundleSchema = z
  .object({
    id: z.string().min(1),
    appId: z.string().min(1),
    /** The end user (or org) the mod belongs to. */
    subjectId: z.string().min(1),
    /** Per-subject monotonic revision counter. */
    revision: z.number().int().nonnegative(),
    binding: ManifestBindingSchema,
    uiOps: z.array(UiOpSchema).default([]),
    hooks: z.array(HookModuleSchema).default([]),
    capabilities: CapabilityManifestSchema.default({
      reads: [],
      writes: [],
      budgets: { cpuMs: 50, memMb: 32 },
    }),
    /** Provenance for theme mods (StyleSpec + compiler); see BundleDesignSchema. */
    design: BundleDesignSchema.optional(),
    createdAt: z.string().datetime(),
  })
  .superRefine((bundle, ctx) => {
    const declared = new Set(
      [...bundle.capabilities.reads, ...bundle.capabilities.writes].map((c) => c.endpointId),
    );
    for (const hook of bundle.hooks) {
      if (!declared.has(hook.trigger.endpointId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["hooks"],
          message: `hook ${hook.id} targets endpoint ${hook.trigger.endpointId} not declared in capabilities`,
        });
      }
    }
  });
export type ModBundle = z.infer<typeof ModBundleSchema>;
