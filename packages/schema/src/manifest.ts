import { z } from "zod";

export const SemverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, "must be semver MAJOR.MINOR.PATCH");

export const DesignTokenSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["color", "spacing", "typography", "radius", "shadow", "other"]),
  value: z.string().min(1),
  description: z.string().optional(),
});
export type DesignToken = z.infer<typeof DesignTokenSchema>;

export const ComponentSlotSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  overridable: z.boolean().default(true),
});

export const ComponentEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  slots: z.array(ComponentSlotSchema).default([]),
});
export type ComponentEntry = z.infer<typeof ComponentEntrySchema>;

export const HttpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

/** Request/response schemas are JSON Schema documents, kept opaque here. */
export const EndpointSchema = z.object({
  id: z.string().min(1),
  method: HttpMethodSchema,
  path: z.string().min(1),
  description: z.string().optional(),
  requestSchema: z.record(z.unknown()).optional(),
  responseSchema: z.record(z.unknown()).optional(),
});
export type Endpoint = z.infer<typeof EndpointSchema>;

export const HookPhaseSchema = z.enum(["request", "response"]);
export type HookPhase = z.infer<typeof HookPhaseSchema>;

export const PolicyRuleSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("endpoint-deny"),
    id: z.string().min(1),
    description: z.string().optional(),
    endpointId: z.string().min(1),
    phases: z.array(HookPhaseSchema).default(["request", "response"]),
  }),
  z.object({
    type: z.literal("field-constraint"),
    id: z.string().min(1),
    description: z.string().optional(),
    endpointId: z.string().min(1),
    /** Dot path into the request/response body, e.g. "order.discountPct". */
    fieldPath: z.string().min(1),
    constraint: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
      enum: z.array(z.union([z.string(), z.number()])).optional(),
      pattern: z.string().optional(),
      /** Mods may never write this field, regardless of declared capabilities. */
      immutable: z.boolean().optional(),
    }),
  }),
  z.object({
    type: z.literal("budget-limit"),
    id: z.string().min(1),
    description: z.string().optional(),
    maxCpuMsPerHook: z.number().int().positive(),
    maxMemMbPerHook: z.number().int().positive(),
  }),
  z.object({
    // Design-system invariants the verifier enforces on theme mods (bundles
    // carrying design provenance). Property-based — the compiler guarantees
    // them by construction; this is the safety net against tampering.
    type: z.literal("design-constraint"),
    id: z.string().min(1),
    description: z.string().optional(),
    /** Minimum WCAG contrast for primary-text pairs (default 4.5 = AA). */
    contrast: z.number().positive().optional(),
    /** Maximum OKLCH chroma for the accent role (keeps it from going neon). */
    accentChromaMax: z.number().positive().optional(),
  }),
]);
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

/**
 * The App Manifest is published by the developer's build (via CLI) and is the
 * contract every mod is authored and verified against: what exists (tokens,
 * components, endpoints) and what must always hold (policies).
 */
export const AppManifestSchema = z
  .object({
    appId: z.string().min(1),
    version: SemverSchema,
    designTokens: z.array(DesignTokenSchema).default([]),
    components: z.array(ComponentEntrySchema).default([]),
    endpoints: z.array(EndpointSchema).default([]),
    policies: z.array(PolicyRuleSchema).default([]),
    createdAt: z.string().datetime(),
  })
  .superRefine((manifest, ctx) => {
    const endpointIds = new Set<string>();
    for (const endpoint of manifest.endpoints) {
      if (endpointIds.has(endpoint.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endpoints"],
          message: `duplicate endpoint id: ${endpoint.id}`,
        });
      }
      endpointIds.add(endpoint.id);
    }
    const componentIds = new Set<string>();
    for (const component of manifest.components) {
      if (componentIds.has(component.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["components"],
          message: `duplicate component id: ${component.id}`,
        });
      }
      componentIds.add(component.id);
    }
    for (const policy of manifest.policies) {
      if ("endpointId" in policy && !endpointIds.has(policy.endpointId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["policies"],
          message: `policy ${policy.id} references unknown endpoint: ${policy.endpointId}`,
        });
      }
    }
  });
export type AppManifest = z.infer<typeof AppManifestSchema>;
