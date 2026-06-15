import type { ThemeJson, InvarianceConfig } from '../config/types'
import type { SlotRegistration } from '../context/registry'
import type { TestResult, VerificationResult } from './types'
import {
  colorInPalette,
  contrastRatioTest,
  fontInAllowlist,
  spacingInScale,
  validHexColors,
  radiiBounded,
  slotStylesSafe,
  slotExists,
} from './theme-tests'
import {
  textNonEmpty,
  noXssVectors,
  imagesHaveAlt,
  textLengthBounded,
} from './content-tests'
import {
  requiredElementsPresent,
  orderConstraints,
  lockedSectionsUntouched,
} from './layout-tests'
import {
  componentInLibrary,
  preservedSlotsNotSwapped,
} from './component-tests'

export function verify(
  themeJson: ThemeJson,
  config: InvarianceConfig,
  level: number,
  registry: SlotRegistration[],
  componentLibrary?: string[],
): VerificationResult {
  const results: TestResult[] = []

  if (level >= 1 && themeJson.theme) {
    results.push(
      colorInPalette(themeJson.theme, config),
      contrastRatioTest(themeJson.theme, config),
      fontInAllowlist(themeJson.theme, config),
      spacingInScale(themeJson.theme, config),
      validHexColors(themeJson.theme),
      radiiBounded(themeJson.theme),
      slotStylesSafe(themeJson.theme),
      slotExists(themeJson.theme, registry),
    )
  }

  if (level >= 2 && themeJson.content) {
    results.push(
      textNonEmpty(themeJson.content),
      noXssVectors(themeJson.content),
      imagesHaveAlt(themeJson.content),
      textLengthBounded(themeJson.content),
    )
  }

  if (level >= 3 && themeJson.layout) {
    results.push(
      requiredElementsPresent(themeJson.layout, config),
      orderConstraints(themeJson.layout, config),
      lockedSectionsUntouched(themeJson.layout, config),
    )
  }

  if (level >= 4 && themeJson.components) {
    results.push(
      componentInLibrary(themeJson.components, componentLibrary ?? []),
      preservedSlotsNotSwapped(themeJson.components, registry),
    )
  }

  return {
    passed: results.every((r) => r.passed || r.severity === 'warning'),
    results,
  }
}
