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
import { getRoleGraph, requiredContrast } from '../roles/index.js';
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

  // (4) locked_drift — derived-role locks pinned to base[mode][role] (string equality).
  // Seed locks (frozen closures) are confirmed by the contrast/chroma sweep above — they do not
  // produce a per-role string pin here. Only roles that appear in graph.roles (derived output roles)
  // are subject to the direct string-equality check.
  for (const lock of locks) {
    // Only derived OUTPUT roles are pinned at the var level; seed-only locks freeze closures and
    // are confirmed by the contrast/chroma sweep above.
    if (!(lock in graph.roles)) continue;
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
