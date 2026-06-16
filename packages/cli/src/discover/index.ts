// packages/cli/src/discover/index.ts
import type { StyleSpec } from "@invariance/design/server";
import type { VariableRoleMap } from "@invariance/schema";
import { inferStyleSpec } from "../infer-spec";
import { discoverVars } from "./vars";
import { classifyVars } from "./classify";
import { buildCoverage, type CoverageReport } from "./coverage";

/** The onboarding proposal: what the vendor confirms in the dashboard (Phase 4). */
export interface DiscoverResult {
  variableRoleMap: VariableRoleMap;
  styleSpec: StyleSpec;
  coverage: CoverageReport;
}

/**
 * Discover → classify → coverage, plus a baseline StyleSpec, from a vendor's
 * built CSS. Deterministic and side-effect-free. The proposal is advisory;
 * the vendor confirms it (Phase 4) before it governs anything.
 */
export function discoverFromCss(css: string): DiscoverResult {
  const vars = discoverVars(css);
  const classified = classifyVars(vars);
  return {
    variableRoleMap: classified.variableRoleMap,
    styleSpec: inferStyleSpec(classified.observations),
    coverage: buildCoverage(classified),
  };
}

export type { DiscoveredVar } from "./vars";
export type { ClassifyResult } from "./classify";
export type { CoverageReport } from "./coverage";
export { discoverVars } from "./vars";
export { classifyVars, normalizeHex } from "./classify";
export { buildCoverage } from "./coverage";
