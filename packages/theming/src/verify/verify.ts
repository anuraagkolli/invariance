// packages/theming/src/verify/verify.ts
import { wcagContrast } from 'culori';
import type { AppManifest } from '../manifest/index.js';
import type { CandidateTheme } from '../compile/index.js';
import type {
  Mode,
  RoleId,
  VarName,
  ContrastPair,
  ContrastTier,
  RoleGraph,
} from '../roles/index.js';
import { getRoleGraph, classifySeedOrDerived, requiredContrast } from '../roles/index.js';
import { affectedClosure } from '../compile/closure.js';
import { isSafeCssTokenValue } from './css-safe.js';
import { reparseToOklch } from './reparse.js';

export type VerifyFailureCode =
  | 'contrast_floor'
  | 'locked_drift'
  | 'chroma_cap'
  | 'mode_not_allowed'
  | 'unsafe_value';

export type VerifyFailure = {
  code: VerifyFailureCode;
  mode: Mode;
  pair?: ContrastPair;
  role?: RoleId;
  varName?: VarName;
  required?: number;
  actual?: number;
  message: string;
};

export type Verdict = { ok: true } | { ok: false; failures: VerifyFailure[] };

// Resolve role -> VarName via the manifest var↔role bridge (first var mapped to the role).
function varForRole(manifest: AppManifest, role: RoleId): VarName | null {
  for (const [varName, def] of Object.entries(manifest.variables)) {
    if (def.role === role) return varName;
  }
  return null;
}

function emitSpaceForVar(manifest: AppManifest, varName: VarName) {
  return manifest.variables[varName]?.emit.space ?? null;
}

// Compute WCAG contrast on the RE-PARSED emitted colors. Returns null if either is unparseable.
function contrastFromReparsed(
  manifest: AppManifest,
  fgVar: VarName,
  fgVal: string,
  bgVar: VarName,
  bgVal: string,
): number | null {
  const fg = reparseToOklch(fgVal, emitSpaceForVar(manifest, fgVar));
  const bg = reparseToOklch(bgVal, emitSpaceForVar(manifest, bgVar));
  if (!fg || !bg) return null;
  // wcagContrast accepts culori color objects; rebuild oklch objects with explicit mode.
  const fgC = { mode: 'oklch' as const, l: fg.l, c: fg.c, h: Number.isNaN(fg.h) ? 0 : fg.h };
  const bgC = { mode: 'oklch' as const, l: bg.l, c: bg.c, h: Number.isNaN(bg.h) ? 0 : bg.h };
  return wcagContrast(fgC, bgC);
}

function checkMode(
  manifest: AppManifest,
  graph: RoleGraph,
  tier: ContrastTier,
  mode: Mode,
  vars: Record<VarName, string>,
  failures: VerifyFailure[],
): void {
  const base = mode === 'light' ? manifest.base.light : manifest.base.dark ?? manifest.base.light;
  const locks = manifest.invariants.locks;
  const chromaCap = manifest.invariants.chromaCap;

  // (2) unsafe_value + (5) chroma_cap — sweep every emitted value once.
  for (const [varName, value] of Object.entries(vars)) {
    if (!isSafeCssTokenValue(value)) {
      failures.push({
        code: 'unsafe_value',
        mode,
        varName,
        role: manifest.variables[varName]?.role,
        message: `Value for ${varName} in ${mode} mode is not a safe CSS token value.`,
      });
      continue; // an unsafe value cannot be meaningfully re-parsed for chroma
    }
    const oklch = reparseToOklch(value, emitSpaceForVar(manifest, varName));
    if (oklch && oklch.c > chromaCap) {
      failures.push({
        code: 'chroma_cap',
        mode,
        varName,
        role: manifest.variables[varName]?.role,
        required: chromaCap,
        actual: oklch.c,
        message: `Color for ${varName} in ${mode} mode has chroma ${oklch.c.toFixed(3)} > cap ${chromaCap}.`,
      });
    }
  }

  // (3) contrast_floor — every contrastPair, on re-parsed emitted values.
  for (const pair of graph.contrastPairs) {
    const fgVar = varForRole(manifest, pair.fg);
    const bgVar = varForRole(manifest, pair.bg);
    if (!fgVar || !bgVar) continue; // unmapped pair → no obligation in this app
    const fgVal = vars[fgVar];
    const bgVal = vars[bgVar];
    if (fgVal == null || bgVal == null) continue;
    const required = requiredContrast(tier, pair.category);
    const actual = contrastFromReparsed(manifest, fgVar, fgVal, bgVar, bgVal);
    if (actual == null || actual < required) {
      failures.push({
        code: 'contrast_floor',
        mode,
        pair,
        required,
        actual: actual ?? 0,
        message: `Contrast ${pair.fg}/${pair.bg} in ${mode} mode is ${
          actual == null ? 'unparseable' : actual.toFixed(2)
        }, below the ${tier} ${pair.category} floor of ${required}.`,
      });
    }
  }

  // (4) locked_drift — string-pin every locked role and its full seed-frozen closure to base[mode].
  //
  // Per spec §4.6: a SEED lock freezes its ENTIRE derivation closure at base. That means every
  // transitively-derived role (e.g. primary → primary-fg, ring; neutral → background, card, …)
  // must equal base[mode][role]. Contrast/chroma alone cannot catch a tampered closure value that
  // still clears those floors — the verifier must independently re-prove the full freeze.
  //
  // We track (role, mode) pairs already covered to avoid duplicate failures when multiple locks
  // share a closure role.
  const pinnedRoles = new Set<RoleId>();

  for (const lock of locks) {
    const classification = (lock in graph.roles)
      ? classifySeedOrDerived(graph, lock)
      : graph.seeds.includes(lock) ? 'seed' : null;

    if (classification === null) continue; // unknown id — skip

    if (classification === 'seed') {
      // Compute the full transitive closure of roles derived from this seed.
      // affectedClosure accepts a Set<SeedId>; for a seed-named output role (e.g. "primary") its
      // derivation kind is "seed" — we pass the seed name that maps to its own SeedId.
      // For pure seeds (e.g. "neutral") that have no output role, we still pass the id as the seed.
      const seedSet = new Set([lock]);
      const closure = affectedClosure(seedSet, graph);

      // Also include the seed-named output role itself if it exists (affectedClosure skips it when
      // the derivation is {kind:"seed",seed:lock} — the role is in graph.roles but affectedClosure
      // only adds roles whose deps hit the seed set; a seed-named role's dep IS the seed itself, so
      // it IS included). Safety-add it explicitly to be sure.
      if (lock in graph.roles) closure.add(lock);

      for (const closureRole of closure) {
        if (pinnedRoles.has(closureRole)) continue; // already pinned by a prior lock
        const varName = varForRole(manifest, closureRole);
        if (!varName) continue; // no var mapping for this role in this manifest — skip
        const emitted = vars[varName];
        const expected = base[closureRole];
        if (emitted == null || expected == null) continue; // no base entry — skip
        if (emitted !== expected) {
          failures.push({
            code: 'locked_drift',
            mode,
            role: closureRole,
            varName,
            message: `Seed-locked closure role ${closureRole} (${varName}) in ${mode} mode emitted "${emitted}" but base pins "${expected}" (frozen by seed lock "${lock}").`,
          });
        }
        pinnedRoles.add(closureRole);
      }
    } else {
      // Derived-role lock: single-role string pin (original behavior).
      if (!(lock in graph.roles)) continue;
      if (pinnedRoles.has(lock)) continue; // already covered
      const varName = varForRole(manifest, lock);
      if (!varName) continue;
      const emitted = vars[varName];
      const expected = base[lock];
      if (emitted != null && expected != null && emitted !== expected) {
        failures.push({
          code: 'locked_drift',
          mode,
          role: lock,
          varName,
          message: `Locked role ${lock} (${varName}) in ${mode} mode emitted "${emitted}" but base pins "${expected}".`,
        });
      }
      pinnedRoles.add(lock);
    }
  }
}

// THE GATE. Pure. Re-checks the FINAL serialized output; trusts nothing upstream.
export function verify(theme: CandidateTheme, manifest: AppManifest): Verdict {
  const graph = getRoleGraph(manifest.vocabVersion);
  const tier = manifest.invariants.contrastTier;
  const allowed = manifest.modes.allowed;
  const failures: VerifyFailure[] = [];

  // (1) mode_not_allowed — every EMITTED mode must be allowed.
  const emittedModes: Mode[] = ['light'];
  if (theme.dark) emittedModes.push('dark');
  for (const mode of emittedModes) {
    if (!allowed.includes(mode)) {
      failures.push({
        code: 'mode_not_allowed',
        mode,
        message: `Theme emits ${mode} mode, which is not in manifest.modes.allowed.`,
      });
    }
  }

  // Per-mode checks run only for modes that are BOTH emitted and allowed.
  for (const mode of emittedModes) {
    if (!allowed.includes(mode)) continue;
    const vars = mode === 'light' ? theme.light : theme.dark!;
    checkMode(manifest, graph, tier, mode, vars, failures);
  }

  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}
