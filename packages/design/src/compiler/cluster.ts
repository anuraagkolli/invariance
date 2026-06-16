import { converter, wcagContrast } from 'culori'

// ---------------------------------------------------------------------------
// Deterministic role clustering (DESIGN 1.3, phase 7).
//
// The scanner observes raw design values on a developer's source. This pass
// classifies the COLOR values into the v6 role vocabulary WITHOUT an LLM and
// WITHOUT inventing any value: every role it fills holds a hex the app already
// uses. The compiler (a separate, later step at theme-edit time) is what fills
// the remaining 38-token set; here we seed only what we saw, so the emitted
// initial theme is partial by design. Verification gates completeness on
// styleSpec presence precisely so these partial seeds pass.
//
// Why cluster per-kind instead of per-color: one hex legitimately serves two
// roles. In the fixture, #1a1a2e is BOTH the sidebar background (surface-2) and
// the body-copy color (text-primary). Collapsing it to a single role by a kind
// vote would lose one of those assignments, so observations are partitioned by
// their CSS property kind first, clustered within each partition, and assigned
// independently. varToRole is therefore keyed by (kind, hex).
// ---------------------------------------------------------------------------

export type ColorKind = 'bg' | 'text' | 'border'

/** One observed color value with the CSS property kind it was used as. */
export interface ColorObservation {
  hex: string
  kind: ColorKind
}

/** A merged group of near-identical OKLCH values of a single kind. */
export interface RoleCluster {
  kind: ColorKind
  /** Highest-count member, normalized; the value the role takes. */
  representative: string
  /** Every normalized member hex that merged into this cluster. */
  members: string[]
  /** Total observation count across all members. */
  count: number
  l: number
  c: number
  h: number
}

export interface RoleAssignment {
  /** role token (e.g. '--inv-surface-0') -> chosen hex. Partial by design. */
  roles: Record<string, string>
  /** `${kind}:${normalizedHex}` -> role token, for slot var() rewiring. */
  varToRole: Map<string, string>
  warnings: string[]
}

// OKLCH proximity tolerances. A cluster absorbs a value within ALL three.
const D_L = 0.03
const D_C = 0.03
const D_H = 8 // degrees, circular
// Chroma at/above this marks a value as a chromatic accent, never a surface.
const ACCENT_CHROMA = 0.07
// Text must clear this contrast floor vs surface-0 to count as readable.
const TEXT_CONTRAST_FLOOR = 3.0

const toOklch = converter('oklch')

/** Normalize 3/6-digit hex to uppercase 6-digit (#RRGGBB). */
export function normalizeHex(value: string): string | undefined {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value.trim())
  if (!m || !m[1]) return undefined
  let hex = m[1]
  if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('')
  return `#${hex.toUpperCase()}`
}

interface Oklch {
  l: number
  c: number
  h: number
}

function parse(hex: string): Oklch | undefined {
  const o = toOklch(hex)
  if (!o || typeof o.l !== 'number') return undefined
  return { l: o.l, c: o.c ?? 0, h: o.h ?? 0 }
}

/** Smallest absolute angular distance between two hues, in degrees. */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

interface Member {
  hex: string
  count: number
  firstIndex: number
  oklch: Oklch
}

/** Aggregate raw observations of one kind into counted, parsed members. */
function membersOfKind(observations: ColorObservation[], kind: ColorKind): Member[] {
  const byHex = new Map<string, Member>()
  observations.forEach((obs, index) => {
    if (obs.kind !== kind) return
    const hex = normalizeHex(obs.hex)
    if (!hex) return
    const oklch = parse(hex)
    if (!oklch) return
    const existing = byHex.get(hex)
    if (existing) existing.count += 1
    else byHex.set(hex, { hex, count: 1, firstIndex: index, oklch })
  })
  return Array.from(byHex.values())
}

/**
 * Classify observed colors into v6 roles. Pure and deterministic: identical
 * observations in, identical assignment out. Fills only the roles it can
 * justify from observed values; everything else is left to the compiler and
 * reported as a warning.
 */
export function clusterColors(observations: ColorObservation[]): RoleAssignment {
  const roles: Record<string, string> = {}
  const varToRole = new Map<string, string>()
  const warnings: string[] = []

  const bgClusters = buildClusters(observations, 'bg')
  const textClusters = buildClusters(observations, 'text')
  const borderClusters = buildClusters(observations, 'border')

  // --- Surface-0 + text (interdependent) -----------------------------------
  // Only low-chroma backgrounds are surfaces; chromatic backgrounds are accents.
  const neutralBg = bgClusters.filter((c) => c.c < ACCENT_CHROMA)
  // surface-0 = the page/body background: the most-used neutral background.
  const sorted = [...neutralBg].sort((a, b) => b.count - a.count)
  const surface0 = sorted[0]
  if (surface0) assign(roles, varToRole, '--inv-surface-0', surface0)
  else warnings.push('No background color observed — surface roles unfilled (compiler will supply them)')

  const surface0Hex = roles['--inv-surface-0']

  // Readable text only: a value must clear the 3:1 floor against surface-0
  // (white-on-white and the like are noise, not text roles). Highest contrast
  // → text-primary, next → text-secondary.
  const readable = textClusters
    .map((c) => ({
      cluster: c,
      contrast: surface0Hex ? wcagContrast(c.representative, surface0Hex) : 0,
    }))
    .filter((t) => !surface0Hex || t.contrast >= TEXT_CONTRAST_FLOOR)
    .sort((a, b) => {
      if (b.contrast !== a.contrast) return b.contrast - a.contrast
      return a.cluster.representative.localeCompare(b.cluster.representative)
    })
  if (readable[0]) assign(roles, varToRole, '--inv-text-primary', readable[0].cluster)
  else warnings.push('No readable text color observed — text-primary unfilled (compiler will supply it)')
  if (readable[1]) assign(roles, varToRole, '--inv-text-secondary', readable[1].cluster)
  else warnings.push('Only one readable text color observed — text-secondary unfilled (compiler will supply it)')

  // --- surface-1 / surface-2 (coherence-guarded) ---------------------------
  // Remaining neutral backgrounds ordered by lightness distance from surface-0
  // → surface-1 (nearest), surface-2 (next). BUT a scanned app routinely reuses
  // its ink color as a dark full-bleed panel (the fixture's #1a1a2e is both the
  // body-text color and the sidebar background). Filling surface-2 with a value
  // text-primary can't read on (≥4.5) would emit a seed that fails its own
  // cross-surface contrast invariant — the very thing the compiler exists to
  // hold. So we skip any surface text-primary fails against; that color stays a
  // slot literal and the compiler resolves the panel's themed value later.
  if (surface0) {
    const textPrimaryHex = roles['--inv-text-primary']
    const readsOn = (hex: string): boolean =>
      textPrimaryHex === undefined || wcagContrast(textPrimaryHex, hex) >= 4.5
    const rest = neutralBg
      .filter((c) => c !== surface0)
      .sort((a, b) => {
        const da = Math.abs(a.l - surface0.l)
        const db = Math.abs(b.l - surface0.l)
        if (da !== db) return da - db
        return a.representative.localeCompare(b.representative)
      })
    const surfaceSlots = ['--inv-surface-1', '--inv-surface-2']
    let next = 0
    for (const cluster of rest) {
      if (next >= surfaceSlots.length) break
      if (!readsOn(cluster.representative)) {
        warnings.push(
          `Neutral background ${cluster.representative} reused as a dark panel ` +
            `(text-primary fails 4.5 on it) — left as a slot literal, not a surface role`,
        )
        continue
      }
      assign(roles, varToRole, surfaceSlots[next]!, cluster)
      next += 1
    }
  }

  // --- Borders --------------------------------------------------------------
  // Most-used border cluster → border; next → border-strong.
  const borders = [...borderClusters].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return a.representative.localeCompare(b.representative)
  })
  if (borders[0]) assign(roles, varToRole, '--inv-border', borders[0])
  else warnings.push('No border color observed — border role unfilled (compiler will supply it)')
  if (borders[1]) assign(roles, varToRole, '--inv-border-strong', borders[1])

  // --- Accent ---------------------------------------------------------------
  // The accent can appear as a background (a button) or text; pool both kinds,
  // keep only chromatic clusters (c ≥ 0.07), and take the most-used.
  const chromatic = [...bgClusters, ...textClusters]
    .filter((c) => c.c >= ACCENT_CHROMA)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.representative.localeCompare(b.representative)
    })
  const accent = chromatic[0]
  if (accent) {
    assign(roles, varToRole, '--inv-accent', accent)
    // accent-contrast: black or white, whichever reads better ON the accent.
    // (DESIGN: solved per-accent, never defaulted to white — white on #e94560
    // is 3.83, a fail; black is 5.48, a pass.)
    const black = wcagContrast('#000000', accent.representative)
    const white = wcagContrast('#FFFFFF', accent.representative)
    roles['--inv-accent-contrast'] = black >= white ? '#000000' : '#FFFFFF'
    // accent-hover: the compiler derives a true hover step from an accent ramp;
    // here we seed it with the accent hex itself as a placeholder so the role is
    // present. The compiler replaces it on the first theme edit.
    roles['--inv-accent-hover'] = accent.representative
  } else {
    warnings.push('No chromatic accent observed (c ≥ 0.07) — accent roles unfilled (compiler will supply them)')
  }

  return { roles, varToRole, warnings }
}

// Build clusters for one kind from the raw observation list.
function buildClusters(observations: ColorObservation[], kind: ColorKind): RoleCluster[] {
  return finalize(membersOfKind(observations, kind), kind)
}

// Greedy proximity clustering + representative selection for one kind.
function finalize(members: Member[], kind: ColorKind): RoleCluster[] {
  const clusters: Array<{ members: Member[]; anchor: Oklch }> = []
  for (const member of members) {
    let placed = false
    for (const cluster of clusters) {
      const a = cluster.anchor
      const o = member.oklch
      const achromatic = a.c < 0.02 || o.c < 0.02
      if (
        Math.abs(a.l - o.l) <= D_L &&
        Math.abs(a.c - o.c) <= D_C &&
        (achromatic || hueDistance(a.h, o.h) <= D_H)
      ) {
        cluster.members.push(member)
        placed = true
        break
      }
    }
    if (!placed) clusters.push({ members: [member], anchor: member.oklch })
  }

  return clusters.map((cluster) => {
    const rep = cluster.members.reduce((best, m) =>
      m.count > best.count || (m.count === best.count && m.firstIndex < best.firstIndex)
        ? m
        : best,
    )
    const count = cluster.members.reduce((n, m) => n + m.count, 0)
    return {
      kind,
      representative: rep.hex,
      members: cluster.members.map((m) => m.hex),
      count,
      l: rep.oklch.l,
      c: rep.oklch.c,
      h: rep.oklch.h,
    }
  })
}

// Record a role assignment and map every member of the cluster (keyed by kind)
// back to the role, so slot variables holding any member value can be rewired
// to var(<role>).
function assign(
  roles: Record<string, string>,
  varToRole: Map<string, string>,
  role: string,
  cluster: RoleCluster,
): void {
  roles[role] = cluster.representative
  for (const hex of cluster.members) {
    varToRole.set(`${cluster.kind}:${hex}`, role)
  }
}
