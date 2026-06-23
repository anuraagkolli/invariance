import type { RoleGraph, Derivation, RoleId, SeedId } from "../roles/index.js";
import type { StyleSpec } from "../spec/index.js";

/** The seeds a single derivation reads, and the roles it reads (foreground-of only). */
export function derivationDeps(d: Derivation): { seeds: SeedId[]; roles: RoleId[] } {
  switch (d.kind) {
    case "seed":
      return { seeds: [d.seed], roles: [] };
    case "surface-anchor":
      return { seeds: [d.seed], roles: [] };
    case "surface-step":
      return { seeds: [d.seed], roles: [] };
    case "line-step":
      return { seeds: [d.seed], roles: [] };
    case "accent-line":
      return { seeds: [d.seed], roles: [] };
    case "offset":
      return { seeds: [d.seed], roles: [] };
    case "pick":
      return { seeds: [d.axis], roles: [] };
    case "foreground-of":
      return { seeds: [], roles: [d.bg] };
  }
}

/** The set of seeds the draft sets (color seeds + radius/density/typography axes). */
export function seedsInDraft(draft: StyleSpec): Set<SeedId> {
  const s = new Set<SeedId>();
  if (draft.colors) {
    for (const seed of ["primary", "accent", "neutral", "destructive"] as const) {
      if (draft.colors[seed] !== undefined) s.add(seed);
    }
  }
  if (draft.radius !== undefined) s.add("radius");
  if (draft.density !== undefined) s.add("density");
  if (draft.shadow !== undefined) s.add("shadow");
  if (draft.borderWeight !== undefined) s.add("borderWeight");
  if (draft.typography) {
    for (const axis of ["display", "body", "mono"] as const) {
      if (draft.typography[axis] !== undefined) s.add(axis);
    }
  }
  return s;
}

/**
 * Every role whose derivation TRANSITIVELY depends on one of `seeds`. The dependency test is the
 * transitive closure over derivation edges (a role depends on the seeds/roles its derivation reads),
 * NOT one-hop seed membership — so setting `primary` pulls in `ring` (accent-line(primary)) and
 * `primary-fg` (foreground-of(primary)).
 */
export function affectedClosure(seeds: Set<SeedId>, graph: RoleGraph): Set<RoleId> {
  const affected = new Set<RoleId>();
  // Iterate to a fixed point: a foreground-of role becomes affected once its bg role is affected.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [role, def] of Object.entries(graph.roles)) {
      if (affected.has(role)) continue;
      const deps = derivationDeps(def.derivation);
      const seedHit = deps.seeds.some((s) => seeds.has(s));
      const roleHit = deps.roles.some((r) => affected.has(r));
      if (seedHit || roleHit) {
        affected.add(role);
        changed = true;
      }
    }
  }
  return affected;
}

/** Topological order over the affected role set: a role appears after every role its derivation reads. */
export function topoOrder(roles: Set<RoleId>, graph: RoleGraph): RoleId[] {
  const order: RoleId[] = [];
  const placed = new Set<RoleId>();
  const visiting = new Set<RoleId>();

  const visit = (role: RoleId): void => {
    if (placed.has(role)) return;
    if (visiting.has(role)) throw new Error(`derivation cycle at role: ${role}`);
    visiting.add(role);
    const def = graph.roles[role];
    if (def) {
      for (const dep of derivationDeps(def.derivation).roles) {
        if (roles.has(dep)) visit(dep);
      }
    }
    visiting.delete(role);
    placed.add(role);
    order.push(role);
  };

  for (const role of roles) visit(role);
  return order;
}
