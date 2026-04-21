import { promises as fs } from 'fs'
import path from 'path'

import yaml from 'js-yaml'
import { parseConfig } from '../../config/parser'
import type { InvarianceConfig } from '../../config/types'

import { applyUnlock, unlockPage, VALID_SECTIONS } from './presets'
import type { UnlockSection } from './presets'
import { formatStatus } from './status'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface UnlockOptions {
  configPath: string
  section: string
  pageRoute?: string | undefined
  pageLevel?: number | undefined
  dryRun: boolean
}

export interface UnlockResult {
  before: InvarianceConfig
  after: InvarianceConfig
  yamlOut: string
  changed: boolean
}

export async function unlock(opts: UnlockOptions): Promise<UnlockResult> {
  const raw = await fs.readFile(opts.configPath, 'utf-8')
  const before = parseConfig(raw)

  let after: InvarianceConfig

  if (opts.section === 'page') {
    if (!opts.pageRoute) {
      throw new Error('--level and a page route are required for "page" section')
    }
    if (opts.pageLevel == null) {
      throw new Error('--level is required when unlocking a page')
    }
    after = unlockPage(before, opts.pageRoute, opts.pageLevel)
  } else {
    after = applyUnlock(before, opts.section as UnlockSection)
  }

  const yamlOut = yaml.dump(after, { lineWidth: 120, quotingType: '"', noRefs: true })

  // Validate the result parses correctly
  parseConfig(yamlOut)

  const changed = raw.trim() !== yamlOut.trim()

  if (!opts.dryRun && changed) {
    await fs.writeFile(opts.configPath, yamlOut, 'utf-8')
  }

  return { before, after, yamlOut, changed }
}

export async function showStatus(configPath: string): Promise<string> {
  const raw = await fs.readFile(configPath, 'utf-8')
  const config = parseConfig(raw)
  return formatStatus(config)
}

export function resolveConfigPath(appPath?: string): string {
  const base = appPath ? path.resolve(appPath) : process.cwd()
  if (base.endsWith('.yaml') || base.endsWith('.yml')) return base
  return path.join(base, 'invariance.config.yaml')
}

export { VALID_SECTIONS }
