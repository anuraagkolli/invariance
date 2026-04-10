import yaml from 'js-yaml'

import { parseConfig } from 'invariance'
import type { InvarianceConfig, ThemeJson } from 'invariance'

export function emitConfigYaml(config: InvarianceConfig): string {
  const out = yaml.dump(config, { lineWidth: 120, quotingType: '"', noRefs: true })
  try {
    parseConfig(out)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`emitConfigYaml produced invalid config: ${msg}`)
  }
  return out
}

export function emitInitialThemeJson(theme: ThemeJson): string {
  return `${JSON.stringify(theme, null, 2)}\n`
}
