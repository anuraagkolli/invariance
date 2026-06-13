// Scanner AST analysis grafted into the CLI (Phase 4): the deterministic
// colour-observation surface used to infer a default StyleSpec and declare the
// role-token vocabulary. The codemod half of the old scanner is intentionally
// NOT here — init writes no source edits.
export { loadProject, jsxPathOf } from './ast/parse'
export { extractColors } from './ast/extract-colors'
export { clusterColors } from './roles/cluster'
export type { ColorObservation, RoleCluster, RoleAssignment, ColorKind } from './roles/cluster'
export type { ObservedValue, TailwindMaps } from './types'
