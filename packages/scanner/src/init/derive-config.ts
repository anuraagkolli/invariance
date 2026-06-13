import type { InvarianceConfig } from 'invariance'

import { applyUnlock, unlockPage } from '../unlock/presets'
import type { UnlockSection } from '../unlock/presets'

// The level at which each app-wide design section becomes available — mirrors
// SECTION_MIN_LEVEL in unlock/presets.ts (kept local to avoid exporting it).
const SECTION_MIN: Array<[Exclude<UnlockSection, 'all'>, number]> = [
  ['colors', 1],
  ['fonts', 1],
  ['spacing', 1],
  ['content', 2],
  ['layout', 3],
  ['components', 4],
]

/** route -> (slotName -> chosen level) */
export type ChosenLevels = Record<string, Record<string, number>>

/**
 * Translate the developer's per-slot level choices into config edits using the
 * existing deterministic unlock presets. Each page rises to the max level
 * chosen among its slots; each app-wide design section is unlocked once any
 * slot reaches its required level. Purely additive — never lowers a level.
 */
export function deriveConfigFromLevels(config: InvarianceConfig, chosen: ChosenLevels): InvarianceConfig {
  let next = config

  let maxAll = 0
  for (const slots of Object.values(chosen)) {
    for (const lvl of Object.values(slots)) maxAll = Math.max(maxAll, lvl)
  }

  // App-wide section unlocks (these also floor every page to the section min).
  for (const [section, min] of SECTION_MIN) {
    if (maxAll >= min) next = applyUnlock(next, section)
  }

  // Per-page level = max(current after flooring, chosen max on the page).
  for (const [route, slots] of Object.entries(chosen)) {
    const pageMax = Math.max(0, ...Object.values(slots))
    const current = next.frontend?.pages?.[route]?.level ?? 0
    const target = Math.max(current, pageMax)
    if (next.frontend?.pages?.[route] && target > current) {
      next = unlockPage(next, route, target)
    }
  }

  return next
}
