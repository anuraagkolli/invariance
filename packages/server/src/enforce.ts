import {
  canonicalJson,
  checkConstraint,
  diffPaths,
  pathCovers,
  resolvePath,
  type AppManifest,
  type CapabilityManifest,
} from "@invariance/schema";

/**
 * Runtime capability enforcement: every path a hook actually changed must be
 * covered by a `writes` declaration for that endpoint (a declaration without
 * `fields` covers the whole body; "*" segments match anything). The verifier
 * approved the *declared* capabilities — this check makes the runtime honor
 * only those. Returns violation reasons; any violation means the hook's
 * output is discarded.
 */
export function checkCapabilityWrites(
  original: unknown,
  transformed: unknown,
  capabilities: CapabilityManifest,
  endpointId: string,
): string[] {
  const changed = diffPaths(original, transformed);
  if (changed.length === 0) return [];
  const writes = capabilities.writes.filter((w) => w.endpointId === endpointId);
  const violations: string[] = [];
  for (const path of changed) {
    const covered = writes.some(
      (w) => w.fields === undefined || w.fields.some((field) => pathCovers(field, path)),
    );
    if (!covered) violations.push(`undeclared write to ${path}`);
  }
  return violations;
}

/**
 * Runtime policy enforcement on the transformed payload: field constraints
 * (min/max/enum/pattern) must hold, and immutable fields must be unchanged.
 *
 * Immutability compares the *multiset* of values resolved at the field path,
 * not positions: reordering a list does not alter anyone's title, but
 * rewriting, adding, or removing one does (so "hide this field" is also
 * caught). This runtime check is defense in depth — verification already
 * rejects bundles whose declared writes target immutable fields directly.
 */
export function checkFieldConstraints(
  manifest: AppManifest,
  endpointId: string,
  original: unknown,
  transformed: unknown,
): string[] {
  const violations: string[] = [];
  for (const policy of manifest.policies) {
    if (policy.type !== "field-constraint" || policy.endpointId !== endpointId) continue;
    if (policy.constraint.immutable) {
      const before = resolvePath(original, policy.fieldPath)
        .map((v) => canonicalJson(v ?? null))
        .sort();
      const after = resolvePath(transformed, policy.fieldPath)
        .map((v) => canonicalJson(v ?? null))
        .sort();
      if (before.length !== after.length || before.some((v, i) => v !== after[i])) {
        violations.push(`immutable field changed: ${policy.fieldPath} (policy ${policy.id})`);
      }
      continue;
    }
    for (const value of resolvePath(transformed, policy.fieldPath)) {
      const reason = checkConstraint(value, policy.constraint);
      if (reason) violations.push(`${policy.fieldPath}: ${reason} (policy ${policy.id})`);
    }
  }
  return violations;
}
