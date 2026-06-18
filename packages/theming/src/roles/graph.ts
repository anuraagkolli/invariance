// packages/theming/src/roles/graph.ts
import type { RoleGraph, RoleId, SeedId } from "./types.js";
import { ivRoles1, VOCAB_VERSION } from "./iv-roles-1.js";

const REGISTRY: Record<string, RoleGraph> = {
  [VOCAB_VERSION]: ivRoles1,
};

// Lookup by version; throws on unknown so a GC'd/typo'd version is loud, not a silent miscompile (§9).
export function getRoleGraph(vocabVersion: string): RoleGraph {
  const graph = REGISTRY[vocabVersion];
  if (!graph) {
    throw new Error(`unknown vocab version: ${vocabVersion}`);
  }
  return graph;
}

// Law 1: mode-polarization keyed on kind. color ⇒ polarized; dimension/typography ⇒ mode-stable.
export function isModePolarized(graph: RoleGraph, role: RoleId): boolean {
  const entry = graph.roles[role];
  if (!entry) {
    throw new Error(`unknown role: ${role}`);
  }
  return entry.kind === "color";
}

// Lock projection: an id is a seed lock iff it is a graph seed OR an output role whose derivation IS
// {kind:"seed"} (a seed-named role like primary). Everything else is a derived-role lock.
export function classifySeedOrDerived(graph: RoleGraph, id: SeedId | RoleId): "seed" | "derived" {
  if (graph.seeds.includes(id)) {
    return "seed";
  }
  const entry = graph.roles[id];
  if (entry && entry.derivation.kind === "seed") {
    return "seed";
  }
  return "derived";
}

// Law 2: the fg member of a failing pair moves (its L); the bg member holds.
export function repairTarget(pair: { fg: RoleId; bg: RoleId }): { moves: RoleId; holds: RoleId } {
  return { moves: pair.fg, holds: pair.bg };
}
