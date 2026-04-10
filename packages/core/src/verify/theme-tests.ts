import type { ThemeSection } from '../config/types'
import type { InvarianceConfig } from '../config/types'
import type { SlotRegistration } from '../context/registry'
import type { TestResult } from './types'
import { isValidHex, looksLikeColor, extractColorsFromStyleValue, contrastRatio } from './utils'

const BANNED_SLOT_PROPERTIES = ['position', 'zIndex', 'content']
const MAX_ZINDEX = 9000

export function colorInPalette(
  theme: ThemeSection,
  config: InvarianceConfig,
): TestResult {
  const colorsConfig = config.frontend?.design?.colors
  if (!colorsConfig || colorsConfig.mode !== 'palette') {
    return { name: 'colorInPalette', passed: true, message: 'Open color mode', severity: 'warning', autoFixable: false }
  }
  const palette = colorsConfig.palette
  const violations: string[] = []

  for (const [key, value] of Object.entries(theme.globals?.colors ?? {})) {
    if (!palette.includes(value)) {
      violations.push(`globals.colors.${key}: ${value}`)
    }
  }

  // Scanner-emitted --inv-* CSS variables live directly on theme.globals.
  for (const [key, value] of Object.entries(theme.globals ?? {})) {
    if (!key.startsWith('--inv-')) continue
    if (typeof value !== 'string') continue
    if (looksLikeColor(value) && !palette.includes(value)) {
      violations.push(`globals.${key}: ${value}`)
    }
    for (const color of extractColorsFromStyleValue(value)) {
      if (!looksLikeColor(value) && !palette.includes(color)) {
        violations.push(`globals.${key} contains ${color}`)
      }
    }
  }

  for (const [slot, styles] of Object.entries(theme.slots ?? {})) {
    for (const [prop, value] of Object.entries(styles)) {
      if (looksLikeColor(value) && !palette.includes(value)) {
        violations.push(`slots.${slot}.${prop}: ${value}`)
      }
      for (const color of extractColorsFromStyleValue(value)) {
        if (!looksLikeColor(value) && !palette.includes(color)) {
          violations.push(`slots.${slot}.${prop} contains ${color}`)
        }
      }
    }
  }

  return {
    name: 'colorInPalette',
    passed: violations.length === 0,
    message: violations.length === 0
      ? 'All colors in palette'
      : `Colors not in palette: ${violations.join(', ')}`,
    severity: 'error',
    autoFixable: true,
    suggestedFix: violations.length > 0 ? `Use colors from palette: ${palette.join(', ')}` : undefined,
  }
}

export function contrastRatioTest(
  theme: ThemeSection,
  config: InvarianceConfig,
): TestResult {
  const colors = theme.globals?.colors
  if (!colors) {
    return { name: 'contrastRatio', passed: true, message: 'No colors defined', severity: 'warning', autoFixable: false }
  }

  const textPrimary = colors['text-primary']
  const bgPrimary = colors['background-primary']
  if (!textPrimary || !bgPrimary) {
    return { name: 'contrastRatio', passed: true, message: 'Missing text/background primary', severity: 'warning', autoFixable: false }
  }

  const minContrast = config.frontend?.accessibility?.wcag_level === 'AAA' ? 7.0 : 4.5
  const ratio = contrastRatio(textPrimary, bgPrimary)

  return {
    name: 'contrastRatio',
    passed: ratio >= minContrast,
    message: ratio >= minContrast
      ? `Contrast ratio ${ratio.toFixed(2)} meets requirement`
      : `Contrast ratio ${ratio.toFixed(2)} below minimum ${minContrast}`,
    severity: 'error',
    autoFixable: false,
  }
}

export function fontInAllowlist(
  theme: ThemeSection,
  config: InvarianceConfig,
): TestResult {
  const allowed = config.frontend?.design?.fonts?.allowed
  if (!allowed) {
    return { name: 'fontInAllowlist', passed: true, message: 'No font restrictions', severity: 'warning', autoFixable: false }
  }

  const violations: string[] = []
  for (const [key, value] of Object.entries(theme.globals?.fonts ?? {})) {
    if (!allowed.includes(value)) {
      violations.push(`${key}: ${value}`)
    }
  }

  return {
    name: 'fontInAllowlist',
    passed: violations.length === 0,
    message: violations.length === 0
      ? 'All fonts allowed'
      : `Fonts not in allowlist: ${violations.join(', ')}`,
    severity: 'error',
    autoFixable: true,
    suggestedFix: violations.length > 0 ? `Use fonts from: ${allowed.join(', ')}` : undefined,
  }
}

export function spacingInScale(
  theme: ThemeSection,
  config: InvarianceConfig,
): TestResult {
  const scale = config.frontend?.design?.spacing?.scale
  if (!scale || !theme.globals?.spacing?.scale) {
    return { name: 'spacingInScale', passed: true, message: 'No spacing constraints', severity: 'warning', autoFixable: false }
  }

  const violations: number[] = []
  for (const val of theme.globals.spacing.scale) {
    if (!scale.includes(val)) {
      violations.push(val)
    }
  }

  return {
    name: 'spacingInScale',
    passed: violations.length === 0,
    message: violations.length === 0
      ? 'All spacing values in scale'
      : `Spacing values not in scale: ${violations.join(', ')}`,
    severity: 'error',
    autoFixable: true,
  }
}

export function validHexColors(theme: ThemeSection): TestResult {
  const violations: string[] = []

  for (const [key, value] of Object.entries(theme.globals?.colors ?? {})) {
    if (!isValidHex(value)) {
      violations.push(`globals.colors.${key}: ${value}`)
    }
  }

  // Scanner-emitted --inv-* CSS variables.
  for (const [key, value] of Object.entries(theme.globals ?? {})) {
    if (!key.startsWith('--inv-')) continue
    if (typeof value !== 'string') continue
    if (looksLikeColor(value) && !isValidHex(value)) {
      violations.push(`globals.${key}: ${value}`)
    }
  }

  for (const [slot, styles] of Object.entries(theme.slots ?? {})) {
    for (const [prop, value] of Object.entries(styles)) {
      if (looksLikeColor(value) && !isValidHex(value)) {
        violations.push(`slots.${slot}.${prop}: ${value}`)
      }
    }
  }

  return {
    name: 'validHexColors',
    passed: violations.length === 0,
    message: violations.length === 0
      ? 'All hex colors valid'
      : `Invalid hex colors: ${violations.join(', ')}`,
    severity: 'error',
    autoFixable: false,
  }
}

export function radiiBounded(theme: ThemeSection): TestResult {
  const violations: string[] = []
  for (const [key, value] of Object.entries(theme.globals?.radii ?? {})) {
    if (value < 0 || value > 64) {
      violations.push(`${key}: ${value}`)
    }
  }

  return {
    name: 'radiiBounded',
    passed: violations.length === 0,
    message: violations.length === 0
      ? 'All radii in range'
      : `Radii out of range (0-64): ${violations.join(', ')}`,
    severity: 'warning',
    autoFixable: true,
  }
}

export function slotStylesSafe(theme: ThemeSection): TestResult {
  const violations: string[] = []

  for (const [slot, styles] of Object.entries(theme.slots ?? {})) {
    for (const [prop, value] of Object.entries(styles)) {
      if (BANNED_SLOT_PROPERTIES.includes(prop)) {
        if (prop === 'zIndex') {
          const num = parseInt(value, 10)
          if (!isNaN(num) && num > MAX_ZINDEX) {
            violations.push(`${slot}.${prop}: ${value} (max ${MAX_ZINDEX})`)
          }
        } else if (prop === 'position' && value === 'fixed') {
          violations.push(`${slot}.${prop}: ${value}`)
        } else if (prop === 'content' && value.includes('url(')) {
          violations.push(`${slot}.${prop}: contains url()`)
        }
      }
    }
  }

  return {
    name: 'slotStylesSafe',
    passed: violations.length === 0,
    message: violations.length === 0
      ? 'All slot styles safe'
      : `Unsafe slot styles: ${violations.join(', ')}`,
    severity: 'error',
    autoFixable: false,
  }
}

export function slotExists(
  theme: ThemeSection,
  registry: SlotRegistration[],
): TestResult {
  const registeredNames = new Set(registry.map((r) => r.name))
  const violations: string[] = []

  for (const slotName of Object.keys(theme.slots ?? {})) {
    if (!registeredNames.has(slotName)) {
      violations.push(slotName)
    }
  }

  return {
    name: 'slotExists',
    passed: violations.length === 0,
    message: violations.length === 0
      ? 'All slot names match registered slots'
      : `Unknown slot names: ${violations.join(', ')}`,
    severity: 'error',
    autoFixable: false,
  }
}
