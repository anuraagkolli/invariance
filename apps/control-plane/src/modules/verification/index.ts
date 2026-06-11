import { pathWithin, type AppManifest, type ModBundle, type PolicyRule } from "@invariance/schema";
import { analyzeHookSource } from "./static-hooks";

export interface VerificationResult {
  ok: boolean;
  reasons: string[];
}

const MAX_SLOT_CONTENT_LENGTH = 10_000;
const MAX_UI_OPS = 200;

const DANGEROUS_HTML = /<\s*(script|iframe|object|embed|link|meta|form)\b|on\w+\s*=|javascript:|srcdoc\s*=/i;
const DANGEROUS_CSS = /expression\s*\(|javascript:|url\s*\(|@import|behavior\s*:/i;
const UNSAFE_SELECTOR = /[{}@;<>]/;

/**
 * Deterministic verification: every check is pure and reproducible — no LLM
 * anywhere. This gate runs before any bundle is signed, and again at
 * revalidation when the developer ships a new manifest.
 */
export function verifyBundleAgainstManifest(
  bundle: ModBundle,
  manifest: AppManifest,
): VerificationResult {
  const reasons: string[] = [];

  if (bundle.binding.appManifestVersion !== manifest.version) {
    reasons.push(
      `bundle is bound to manifest ${bundle.binding.appManifestVersion}, current is ${manifest.version}`,
    );
  }
  if (bundle.uiOps.length > MAX_UI_OPS) {
    reasons.push(`too many ui ops (${bundle.uiOps.length} > ${MAX_UI_OPS})`);
  }

  const tokenNames = new Set(manifest.designTokens.map((t) => t.name));
  const componentsById = new Map(manifest.components.map((c) => [c.id, c]));
  const endpointsById = new Map(manifest.endpoints.map((e) => [e.id, e]));

  for (const op of bundle.uiOps) {
    switch (op.type) {
      case "token-override":
        if (!tokenNames.has(op.token)) {
          reasons.push(`unknown design token: ${op.token}`);
        }
        if (DANGEROUS_CSS.test(op.value)) {
          reasons.push(`unsafe value for token ${op.token}`);
        }
        break;
      case "style-rule": {
        if (UNSAFE_SELECTOR.test(op.selector)) {
          reasons.push(`unsafe selector: ${op.selector}`);
        }
        for (const [prop, value] of Object.entries(op.declarations)) {
          if (DANGEROUS_CSS.test(value)) {
            reasons.push(`unsafe css declaration: ${prop}`);
          }
        }
        break;
      }
      case "slot-override": {
        const component = componentsById.get(op.componentId);
        const slot = component?.slots.find((s) => s.name === op.slot);
        if (!component || !slot) {
          reasons.push(`unknown slot: ${op.componentId}.${op.slot}`);
        } else if (!slot.overridable) {
          reasons.push(`slot is not overridable: ${op.componentId}.${op.slot}`);
        }
        if (op.content.length > MAX_SLOT_CONTENT_LENGTH) {
          reasons.push(`slot content too large: ${op.componentId}.${op.slot}`);
        }
        if (DANGEROUS_HTML.test(op.content)) {
          reasons.push(`unsafe slot content: ${op.componentId}.${op.slot}`);
        }
        break;
      }
    }
  }

  const deniedPhases = new Map<string, Set<string>>();
  const immutablePaths = new Map<string, string[]>();
  let budgetPolicy: Extract<PolicyRule, { type: "budget-limit" }> | null = null;
  for (const policy of manifest.policies) {
    if (policy.type === "endpoint-deny") {
      const set = deniedPhases.get(policy.endpointId) ?? new Set();
      for (const phase of policy.phases) set.add(phase);
      deniedPhases.set(policy.endpointId, set);
    } else if (policy.type === "field-constraint" && policy.constraint.immutable) {
      const paths = immutablePaths.get(policy.endpointId) ?? [];
      paths.push(policy.fieldPath);
      immutablePaths.set(policy.endpointId, paths);
    } else if (policy.type === "budget-limit") {
      budgetPolicy = policy;
    }
  }

  for (const capability of [...bundle.capabilities.reads, ...bundle.capabilities.writes]) {
    if (!endpointsById.has(capability.endpointId)) {
      reasons.push(`capability references unknown endpoint: ${capability.endpointId}`);
    }
  }

  for (const hook of bundle.hooks) {
    if (!endpointsById.has(hook.trigger.endpointId)) {
      reasons.push(`hook ${hook.id} targets unknown endpoint: ${hook.trigger.endpointId}`);
      continue;
    }
    if (deniedPhases.get(hook.trigger.endpointId)?.has(hook.trigger.phase)) {
      reasons.push(
        `hook ${hook.id} targets denied endpoint ${hook.trigger.endpointId} (${hook.trigger.phase})`,
      );
    }
    for (const reason of analyzeHookSource(hook.source)) {
      reasons.push(`hook ${hook.id}: ${reason}`);
    }
  }

  // Declared writes may not target an immutable field (the field itself or
  // anything inside it), and whole-body declarations are rejected outright on
  // endpoints with immutable fields. A strict ancestor (e.g. "shows" when
  // "shows.*.title" is immutable) is allowed: it grants container-level
  // operations like reordering, while the runtime's multiset immutability
  // check guarantees the protected values themselves survive unchanged.
  for (const write of bundle.capabilities.writes) {
    const constrained = immutablePaths.get(write.endpointId) ?? [];
    for (const path of constrained) {
      if (write.fields === undefined) {
        reasons.push(
          `write capability on ${write.endpointId} covers immutable field ${path}` +
            " (declare granular fields, not whole-body writes)",
        );
        continue;
      }
      for (const field of write.fields) {
        if (pathWithin(field, path)) {
          reasons.push(`write capability on ${write.endpointId} covers immutable field ${path}`);
        }
      }
    }
  }

  if (budgetPolicy) {
    if (bundle.capabilities.budgets.cpuMs > budgetPolicy.maxCpuMsPerHook) {
      reasons.push(
        `cpu budget ${bundle.capabilities.budgets.cpuMs}ms exceeds policy max ${budgetPolicy.maxCpuMsPerHook}ms`,
      );
    }
    if (bundle.capabilities.budgets.memMb > budgetPolicy.maxMemMbPerHook) {
      reasons.push(
        `memory budget ${bundle.capabilities.budgets.memMb}MB exceeds policy max ${budgetPolicy.maxMemMbPerHook}MB`,
      );
    }
  }

  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export { analyzeHookSource };
