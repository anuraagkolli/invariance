import yaml from 'js-yaml'

import { ConfigParseError, ConfigValidationError } from '../utils/errors'
import type { InvarianceConfig } from './types'
import { InvarianceConfigSchema } from './schema'

export function parseConfig(yamlString: string): InvarianceConfig {
  let raw: unknown
  try {
    raw = yaml.load(yamlString)
  } catch (err) {
    throw new ConfigParseError(`Failed to parse YAML: ${String(err)}`, err)
  }

  const result = InvarianceConfigSchema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    )
    throw new ConfigValidationError(`Config validation failed`, issues)
  }

  return result.data as InvarianceConfig
}
