import type { InvarianceConfig } from '@invariance/design'
import { designConfigConstraints, type DesignConfigConstraintsInput } from '@invariance/design'

// The developer's runtime lock/unlock state, layered over the static base
// config. Pure and isomorphic (client + server): the Console edits it via the
// control-plane design-config, layout.tsx fetches it from there and merges it
// into the config the whole app (gatekeeper, compiler, verify suite) reads per
// request.

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
  // vendor var → role binding; entries with locked:true + value pin a brand value
  variableRoleMap?: DesignConfigConstraintsInput['variableRoleMap']
  // modes customization may use; empty/absent = unrestricted
  allowedModes?: Array<'light' | 'dark'>
}

export const EMPTY_OVERLAY: DevConfigOverlay = {}

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

  // All constraint governance (accent lock, value-pinned locks, chroma cap,
  // contrast floor, allowed modes) is derived by the shared package bridge —
  // one lock model, reused by the console + SDK.
  const constraintOverrides = designConfigConstraints(overlay)

  if (Object.keys(constraintOverrides).length > 0) {
    const design = { ...merged.frontend?.design }
    design.constraints = {
      ...design.constraints,
      ...constraintOverrides,
      ...(constraintOverrides.locked_tokens
        ? { locked_tokens: { ...design.constraints?.locked_tokens, ...constraintOverrides.locked_tokens } }
        : {}),
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
