import type { MigrationPlan, StaticExtraction } from '../types'

// ---------------------------------------------------------------------------
// Human-readable migration report (markdown).
// ---------------------------------------------------------------------------

export function renderReport(plan: MigrationPlan, extractions: StaticExtraction[]): string {
  const lines: string[] = []
  lines.push(`# Invariance Migration Report`)
  lines.push('')
  lines.push(`**App:** ${plan.config.app}`)
  lines.push('')

  lines.push(`## Pages`)
  if (extractions.length === 0) {
    lines.push('_None discovered._')
  } else {
    for (const e of extractions) {
      lines.push(`- \`${e.page}\` — ${e.pageFile}`)
    }
  }
  lines.push('')

  lines.push(`## Slots`)
  interface SlotLocation {
    name: string
    file: string
    jsxPath: string
    preserve: boolean
  }
  const slotLocations =
    (plan as unknown as { __slotLocations?: SlotLocation[] }).__slotLocations ?? []
  if (slotLocations.length === 0) {
    lines.push('_No slots assigned._')
  } else {
    for (const slot of slotLocations) {
      const vars = plan.slotCssVariables[slot.name] ?? []
      const preserve = slot.preserve ? ' (preserve)' : ''
      lines.push(`- **${slot.name}** — level 0${preserve}`)
      lines.push(`  - file: ${slot.file}`)
      lines.push(`  - jsxPath: \`${slot.jsxPath}\``)
      if (vars.length > 0) {
        lines.push(`  - css variables:`)
        for (const v of vars) {
          const initial =
            plan.slotVariableInitialValues[slot.name]?.[v] ?? '(unknown)'
          lines.push(`    - \`${v}\` = \`${initial}\``)
        }
      }
    }
  }
  lines.push('')

  const palette: string[] = []
  const paletteColors = plan.config.frontend?.design?.colors
  if (paletteColors && paletteColors.mode === 'palette') {
    palette.push(...paletteColors.palette)
  }
  lines.push(`## Detected Palette`)
  if (palette.length === 0) {
    lines.push('_None._')
  } else {
    for (const c of palette) lines.push(`- \`${c}\``)
  }
  lines.push('')

  lines.push(`## Detected Fonts`)
  const fonts = plan.config.frontend?.design?.fonts?.allowed ?? []
  if (fonts.length === 0) {
    lines.push('_None._')
  } else {
    for (const f of fonts) lines.push(`- ${f}`)
  }
  lines.push('')

  lines.push(`## Detected Spacing Scale`)
  const scale = plan.config.frontend?.design?.spacing?.scale ?? []
  if (scale.length === 0) {
    lines.push('_None._')
  } else {
    lines.push(`\`[${scale.join(', ')}]\``)
  }
  lines.push('')

  lines.push(`## Warnings`)
  if (plan.warnings.length === 0) {
    lines.push('_None._')
  } else {
    for (const w of plan.warnings) lines.push(`- ${w}`)
  }
  lines.push('')

  return lines.join('\n')
}
