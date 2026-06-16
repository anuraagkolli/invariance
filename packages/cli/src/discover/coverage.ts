import type { ClassifyResult } from "./classify";

/** Onboarding ICP-fit report: how much of the app's color surface is drivable. */
export interface CoverageReport {
  /** Color vars mapped to a role. */
  classified: string[];
  /** Color vars with no role (incl. color formats not yet parsed). */
  unclassified: string[];
  /** Vars whose value is not a color (lengths, etc.) — excluded from coverage. */
  nonColor: string[];
  /** classified / (classified + unclassified) — "% of color surface drivable"; 0 when none. */
  coverage: number;
  /** role -> the vendor vars driving it. */
  byRole: Record<string, string[]>;
}

export function buildCoverage(result: ClassifyResult): CoverageReport {
  const classified = Object.keys(result.variableRoleMap);
  const colorTotal = classified.length + result.unclassified.length;
  const byRole: Record<string, string[]> = {};
  for (const [name, entry] of Object.entries(result.variableRoleMap)) {
    (byRole[entry.role] ??= []).push(name);
  }
  return {
    classified,
    unclassified: result.unclassified,
    nonColor: result.nonColor,
    coverage: colorTotal === 0 ? 0 : classified.length / colorTotal,
    byRole,
  };
}
