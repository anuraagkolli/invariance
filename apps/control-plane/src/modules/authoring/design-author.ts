import type { AppManifest, ModBundle, PolicyRule, UiOp } from "@invariance/schema";
import { compileTheme, type DesignConstraints, type StyleSpec } from "@invariance/design/server";
import type { AgentInput, AuthoringAgent } from "./agent";
import type { ModDraft } from "../registry";

// The compiler version stamped into a theme mod's provenance, so re-fix knows
// which compiler produced the live token map. Bump when the compiler's output
// changes in a way that should trigger recompilation.
const COMPILER_ID = "@invariance/design@0.0.1";

/** Decides whether a prompt is a theme/look request (the design path) vs an
 *  API-hook / content request (the base agent's path). */
export type ThemeClassifier = (input: AgentInput) => boolean | Promise<boolean>;

/** Produces a StyleSpec from a look prompt (the Designer LLM, or a test stub).
 *  It emits structured design *intent* — never colour values. */
export type ThemeDesigner = (input: {
  request: string;
  constraints: DesignConstraints;
  currentSpec?: StyleSpec;
  feedback: string[];
}) => Promise<StyleSpec>;

export interface DesignAwareOptions {
  classify: ThemeClassifier;
  design: ThemeDesigner;
  /** Overrides the provenance stamp (mainly for tests). */
  compilerId?: string;
}

/**
 * Read design constraints from the manifest's `design-constraint` policy, so
 * both authoring and re-fix compile under the developer's invariants (contrast
 * floor, accent chroma cap). Absent fields fall back to the compiler's own AA
 * defaults — the output is safe regardless.
 */
export function designConstraintsFromManifest(manifest: AppManifest): DesignConstraints {
  const policy = manifest.policies.find(
    (p): p is Extract<PolicyRule, { type: "design-constraint" }> => p.type === "design-constraint",
  );
  const constraints: DesignConstraints = {};
  if (policy?.contrast != null) constraints.contrast = policy.contrast;
  if (policy?.accentChromaMax != null) constraints.accent_chroma_max = policy.accentChromaMax;
  return constraints;
}

/**
 * Recompile a theme mod's stored StyleSpec under the current manifest — the
 * deterministic re-fix path. When a developer ships a manifest that tightens a
 * design constraint, a degraded theme can be regenerated from its provenance
 * (no LLM, no re-prompt): the compiler re-solves the role tokens under the new
 * constraints. Non-token ops (slot/style) and the subject's API hooks are
 * preserved.
 */
export function recompileTheme(
  styleSpec: StyleSpec,
  currentBundle: ModBundle,
  manifest: AppManifest,
  compilerId = COMPILER_ID,
): ModDraft {
  const constraints = designConstraintsFromManifest(manifest);
  const { roles, warnings } = compileTheme(styleSpec, constraints);
  const tokenOps: UiOp[] = Object.entries(roles).map(([token, value]) => ({
    type: "token-override",
    token,
    value,
  }));
  const kept = currentBundle.uiOps.filter((op) => op.type !== "token-override");
  return {
    uiOps: [...kept, ...tokenOps],
    hooks: currentBundle.hooks,
    capabilities: currentBundle.capabilities,
    design: {
      styleSpec: styleSpec as unknown as Record<string, unknown>,
      compiledBy: compilerId,
      warnings,
    },
  };
}

/**
 * Decorate an AuthoringAgent so THEME prompts are produced by the deterministic
 * design engine instead of free-form LLM token edits:
 *
 *   classify -> Designer emits a StyleSpec -> Theme Compiler expands it into a
 *   coherent, contrast-solved role-token map -> emitted as token-override ops.
 *
 * The LLM never picks a colour value; the compiler does, and (Phase 3) the
 * verifier proves it. Non-theme prompts fall through to the base agent
 * unchanged, and the verifier-in-the-loop in authorMod is untouched — this is
 * purely a smarter draft source. A theme edit preserves the subject's existing
 * API hooks and slot/style ops; only the token-override surface is replaced.
 */
export function createDesignAwareAgent(
  base: AuthoringAgent,
  opts: DesignAwareOptions,
): AuthoringAgent {
  const compiledBy = opts.compilerId ?? COMPILER_ID;
  return {
    async generateDraft(input: AgentInput): Promise<unknown> {
      if (!(await opts.classify(input))) return base.generateDraft(input);

      const constraints = designConstraintsFromManifest(input.manifest);
      const currentSpec = input.currentBundle?.design?.styleSpec as StyleSpec | undefined;
      const spec = await opts.design({
        request: input.prompt,
        constraints,
        feedback: input.feedback,
        ...(currentSpec ? { currentSpec } : {}),
      });

      const { roles, warnings } = compileTheme(spec, constraints);
      const tokenOps: UiOp[] = Object.entries(roles).map(([token, value]) => ({
        type: "token-override",
        token,
        value,
      }));

      // Preserve non-theme customizations (API hooks, slot/style ops); only the
      // token-override surface is owned by the theme.
      const kept = (input.currentBundle?.uiOps ?? []).filter(
        (op) => op.type !== "token-override",
      );

      const draft: ModDraft = {
        uiOps: [...kept, ...tokenOps],
        hooks: input.currentBundle?.hooks ?? [],
        ...(input.currentBundle?.capabilities
          ? { capabilities: input.currentBundle.capabilities }
          : {}),
        design: {
          styleSpec: spec as unknown as Record<string, unknown>,
          compiledBy,
          warnings,
        },
      };
      return draft;
    },
  };
}
