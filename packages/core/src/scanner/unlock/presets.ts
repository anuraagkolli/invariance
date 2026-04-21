import type { InvarianceConfig } from '../../config/types'

// ---------------------------------------------------------------------------
// Section names that map to unlock commands
// ---------------------------------------------------------------------------

export type UnlockSection =
  | 'colors'
  | 'fonts'
  | 'spacing'
  | 'content'
  | 'layout'
  | 'components'
  | 'all'

// Minimum page level required when a section is unlocked
const SECTION_MIN_LEVEL: Record<Exclude<UnlockSection, 'all'>, number> = {
  colors: 1,
  fonts: 1,
  spacing: 1,
  content: 2,
  layout: 3,
  components: 4,
}

// ---------------------------------------------------------------------------
// Pure transform functions — each takes a config and returns a new one
// ---------------------------------------------------------------------------

function ensureMinPageLevel(config: InvarianceConfig, minLevel: number): InvarianceConfig {
  const pages = config.frontend?.pages
  if (!pages) return config

  const updated: Record<string, { level: number; required?: string[] }> = {}
  for (const [route, page] of Object.entries(pages)) {
    updated[route] = {
      ...page,
      level: Math.max(page.level, minLevel),
    }
  }

  return {
    ...config,
    frontend: {
      ...config.frontend,
      pages: updated,
    },
  }
}

export function unlockColors(config: InvarianceConfig): InvarianceConfig {
  const result: InvarianceConfig = {
    ...config,
    frontend: {
      ...config.frontend,
      design: {
        ...config.frontend?.design,
        colors: { mode: 'any' },
      },
    },
  }
  return ensureMinPageLevel(result, SECTION_MIN_LEVEL.colors)
}

export function unlockFonts(config: InvarianceConfig): InvarianceConfig {
  const design = { ...config.frontend?.design }
  delete design.fonts

  const result: InvarianceConfig = {
    ...config,
    frontend: {
      ...config.frontend,
      design,
    },
  }
  return ensureMinPageLevel(result, SECTION_MIN_LEVEL.fonts)
}

export function unlockSpacing(config: InvarianceConfig): InvarianceConfig {
  const design = { ...config.frontend?.design }
  delete design.spacing

  const result: InvarianceConfig = {
    ...config,
    frontend: {
      ...config.frontend,
      design,
    },
  }
  return ensureMinPageLevel(result, SECTION_MIN_LEVEL.spacing)
}

export function unlockContent(config: InvarianceConfig): InvarianceConfig {
  return ensureMinPageLevel(config, SECTION_MIN_LEVEL.content)
}

export function unlockLayout(config: InvarianceConfig): InvarianceConfig {
  const structure = { ...config.frontend?.structure }
  structure.locked_sections = []
  delete structure.section_order

  const result: InvarianceConfig = {
    ...config,
    frontend: {
      ...config.frontend,
      structure,
    },
  }
  return ensureMinPageLevel(result, SECTION_MIN_LEVEL.layout)
}

export function unlockComponents(config: InvarianceConfig): InvarianceConfig {
  return ensureMinPageLevel(config, SECTION_MIN_LEVEL.components)
}

export function unlockAll(config: InvarianceConfig): InvarianceConfig {
  let result = config
  result = unlockColors(result)
  result = unlockFonts(result)
  result = unlockSpacing(result)
  result = unlockContent(result)
  result = unlockLayout(result)
  result = unlockComponents(result)
  return result
}

export function unlockPage(
  config: InvarianceConfig,
  route: string,
  level: number,
): InvarianceConfig {
  const pages = { ...config.frontend?.pages }
  const existing = pages[route]
  if (!existing) {
    throw new Error(`page "${route}" not found in config. Available pages: ${Object.keys(pages).join(', ')}`)
  }
  pages[route] = { ...existing, level }

  return {
    ...config,
    frontend: {
      ...config.frontend,
      pages,
    },
  }
}

// ---------------------------------------------------------------------------
// Section resolver
// ---------------------------------------------------------------------------

const SECTION_TRANSFORMS: Record<Exclude<UnlockSection, 'all'>, (c: InvarianceConfig) => InvarianceConfig> = {
  colors: unlockColors,
  fonts: unlockFonts,
  spacing: unlockSpacing,
  content: unlockContent,
  layout: unlockLayout,
  components: unlockComponents,
}

export function applyUnlock(config: InvarianceConfig, section: UnlockSection): InvarianceConfig {
  if (section === 'all') return unlockAll(config)
  return SECTION_TRANSFORMS[section](config)
}

export const VALID_SECTIONS: readonly string[] = [
  'colors', 'fonts', 'spacing', 'content', 'layout', 'components', 'page', 'all',
]
