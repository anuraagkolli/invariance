import type { InvarianceConfig } from '../../config/types'

// ---------------------------------------------------------------------------
// Status display — shows what's locked/unlocked in the config
// ---------------------------------------------------------------------------

interface SectionStatus {
  section: string
  status: 'locked' | 'unlocked'
  detail: string
}

export function getStatus(config: InvarianceConfig): SectionStatus[] {
  const statuses: SectionStatus[] = []
  const design = config.frontend?.design
  const structure = config.frontend?.structure

  // Colors
  if (design?.colors) {
    if (design.colors.mode === 'palette') {
      const count = design.colors.palette.length
      statuses.push({ section: 'colors', status: 'locked', detail: `palette (${count} colors)` })
    } else {
      statuses.push({ section: 'colors', status: 'unlocked', detail: 'any color allowed' })
    }
  } else {
    statuses.push({ section: 'colors', status: 'unlocked', detail: 'no constraints' })
  }

  // Fonts
  if (design?.fonts?.allowed) {
    statuses.push({ section: 'fonts', status: 'locked', detail: `${design.fonts.allowed.length} font stack(s)` })
  } else {
    statuses.push({ section: 'fonts', status: 'unlocked', detail: 'any font allowed' })
  }

  // Spacing
  if (design?.spacing?.scale) {
    statuses.push({ section: 'spacing', status: 'locked', detail: `scale [${design.spacing.scale.join(',')}]` })
  } else {
    statuses.push({ section: 'spacing', status: 'unlocked', detail: 'any spacing allowed' })
  }

  // Structure / Layout
  const locked = structure?.locked_sections ?? []
  const total = structure?.required_sections ?? []
  if (locked.length > 0) {
    statuses.push({ section: 'layout', status: 'locked', detail: `${locked.length}/${total.length} sections locked` })
  } else {
    statuses.push({ section: 'layout', status: 'unlocked', detail: 'no sections locked' })
  }

  // Pages
  const pages = config.frontend?.pages ?? {}
  for (const [route, page] of Object.entries(pages)) {
    const levelLabel = page.level === 0 ? 'locked' : `level ${page.level}`
    statuses.push({
      section: `page ${route}`,
      status: page.level === 0 ? 'locked' : 'unlocked',
      detail: levelLabel,
    })
  }

  return statuses
}

export function formatStatus(config: InvarianceConfig): string {
  const statuses = getStatus(config)
  const lines: string[] = []

  const maxSection = Math.max(...statuses.map((s) => s.section.length), 7)
  const maxStatus = 8

  lines.push(
    `${'Section'.padEnd(maxSection)}  ${'Status'.padEnd(maxStatus)}  Detail`,
  )
  lines.push('-'.repeat(maxSection + maxStatus + 20))

  for (const s of statuses) {
    const icon = s.status === 'locked' ? 'x' : 'o'
    lines.push(
      `${s.section.padEnd(maxSection)}  [${icon}] ${s.status.padEnd(maxStatus - 4)}  ${s.detail}`,
    )
  }

  return lines.join('\n')
}
