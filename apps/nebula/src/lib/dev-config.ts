import type { InvarianceConfig } from '@invariance/design'

// The developer's runtime lock/unlock state, layered over the static base
// config. Pure and isomorphic (client + server): the /dev dashboard edits it,
// /api/dev-config persists it, and layout.tsx merges it into the config the
// whole app (gatekeeper, compiler, verify suite) reads per request.

export interface DevConfigOverlay {
  // route → 0..4; only routes already in the base config are honored
  pageLevels?: Record<string, number>
  // hex like '#e94560' locks --inv-accent; null/absent = unlocked
  accentLock?: string | null
  // m.slot section names the user may not hide/remove
  lockedSections?: string[]
  // caps accent chroma; overrides constraints.accent_chroma_max (in [0.10, 0.25])
  chromaCap?: number
  // minimum WCAG ratio; overrides constraints.contrast (in [1, 21])
  contrastFloor?: number
}

export const EMPTY_OVERLAY: DevConfigOverlay = {}

const HEX_RE = /^#[0-9a-f]{6}$/i

const clampLevel = (n: number): number => Math.max(0, Math.min(4, Math.trunc(n)))

// Never mutates base: every touched path is copied on the way down.
export function mergeInvarianceConfig(base: InvarianceConfig, overlay: DevConfigOverlay): InvarianceConfig {
  const merged: InvarianceConfig = {
    ...base,
    frontend: { ...base.frontend },
  }

  if (overlay.pageLevels && base.frontend?.pages) {
    const pages = { ...base.frontend.pages }
    for (const [route, level] of Object.entries(overlay.pageLevels)) {
      const existing = pages[route]
      if (existing === undefined || typeof level !== 'number' || Number.isNaN(level)) continue
      pages[route] = { ...existing, level: clampLevel(level) }
    }
    merged.frontend!.pages = pages
  }

  // Accumulate every constraint override (accent lock, chroma cap, contrast
  // floor) into one object and apply it in a single spread, so a config that
  // sets several overlay fields doesn't clobber the others.
  const constraintOverrides: NonNullable<NonNullable<InvarianceConfig['frontend']>['design']>['constraints'] = {}

  if (typeof overlay.accentLock === 'string' && HEX_RE.test(overlay.accentLock)) {
    constraintOverrides.locked_tokens = {
      ...merged.frontend?.design?.constraints?.locked_tokens,
      '--inv-accent': overlay.accentLock,
    }
  }

  if (typeof overlay.chromaCap === 'number' && Number.isFinite(overlay.chromaCap) && overlay.chromaCap >= 0.1 && overlay.chromaCap <= 0.25) {
    constraintOverrides.accent_chroma_max = overlay.chromaCap
  }

  if (typeof overlay.contrastFloor === 'number' && Number.isFinite(overlay.contrastFloor) && overlay.contrastFloor >= 1 && overlay.contrastFloor <= 21) {
    constraintOverrides.contrast = '>= ' + overlay.contrastFloor
  }

  if (Object.keys(constraintOverrides).length > 0) {
    const design = { ...merged.frontend?.design }
    design.constraints = { ...design.constraints, ...constraintOverrides }
    merged.frontend!.design = design
  }

  if (overlay.lockedSections && overlay.lockedSections.length > 0) {
    merged.frontend!.structure = {
      ...merged.frontend?.structure,
      locked_sections: overlay.lockedSections.filter((s) => typeof s === 'string'),
    }
  }

  return merged
}
