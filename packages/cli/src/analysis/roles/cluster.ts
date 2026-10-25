// The pure OKLCH role clustering moved to core's compiler (packages/core/src/
// compiler/cluster.ts) so the no-React Trial snippet can share ONE implementation
// without depending on the scanner (ts-morph is unbundleable). The scanner keeps
// importing it from this path; this module is now a thin re-export from the core
// barrel. Why re-export instead of changing every call site: build-plan.ts and the
// colocated cluster.test.ts already target '../roles/cluster', and keeping the test
// here — importing through this re-export — is what proves the boundary holds.
export { clusterColors } from '@invariance/design/server'
export type { ColorObservation, RoleCluster, RoleAssignment, ColorKind } from '@invariance/design/server'
