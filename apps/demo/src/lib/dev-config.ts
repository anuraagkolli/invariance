import type { InvarianceConfig } from 'invariance'

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

  if (typeof overlay.accentLock === 'string' && HEX_RE.test(overlay.accentLock)) {
    const design = { ...merged.frontend?.design }
    design.constraints = {
      ...design.constraints,
      locked_tokens: { ...design.constraints?.locked_tokens, '--inv-accent': overlay.accentLock },
    }
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
