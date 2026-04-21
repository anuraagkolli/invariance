import path from 'path'
import type { MigrationPlan, StaticExtraction } from '../types'

// ---------------------------------------------------------------------------
// Internal types (side-data attached by migrate.ts)
// ---------------------------------------------------------------------------

interface SlotLocation {
  name: string
  file: string
  jsxPath: string
  preserve: boolean
  description?: string
  aliases?: string[]
}

interface TextLocation {
  name: string
  file: string
  jsxPath: string
}

// ---------------------------------------------------------------------------
// Human-readable migration report (markdown).
// ---------------------------------------------------------------------------

export function renderReport(
  plan: MigrationPlan,
  extractions: StaticExtraction[],
  options?: { semanticNaming?: boolean; appRoot?: string },
): string {
  const slotLocations: SlotLocation[] =
    (plan as unknown as { __slotLocations?: SlotLocation[] }).__slotLocations ?? []
  const textLocations: TextLocation[] =
    (plan as unknown as { __textLocations?: TextLocation[] }).__textLocations ?? []

  const appRoot = options?.appRoot ?? ''
  const rel = (f: string) => (appRoot ? path.relative(appRoot, f) : f)

  const semanticNaming = options?.semanticNaming ?? false

  // Pre-compute stats
  const totalCssVars = Object.values(plan.slotCssVariables).reduce((n, vs) => n + vs.length, 0)
  const slotsWithVars = slotLocations.filter(
    (s) => (plan.slotCssVariables[s.name]?.length ?? 0) > 0,
  )
  const slotsWithoutVars = slotLocations.filter(
    (s) => (plan.slotCssVariables[s.name]?.length ?? 0) === 0,
  )

  // Build a map from jsxPath+file -> observed text content for the text nodes table
  const textContentMap = new Map<string, string>()
  for (const extraction of extractions) {
    for (const t of extraction.texts) {
      textContentMap.set(`${t.file}::${t.jsxPath}`, t.text)
    }
  }

  // Parse collision warnings into groups: slotName -> role -> count
  const collisionGroups = new Map<string, Map<string, number>>()
  for (const w of plan.warnings) {
    const m = /Slot '([^']+)' has multiple values for role '([^']+)'/.exec(w)
    if (!m || !m[1] || !m[2]) continue
    const [, slotName, role] = m
    if (!collisionGroups.has(slotName)) collisionGroups.set(slotName, new Map())
    const roleMap = collisionGroups.get(slotName)!
    roleMap.set(role, (roleMap.get(role) ?? 1) + 1)
  }

  // Modified source files (deduplicated)
  const modifiedSourceFiles = new Set<string>()
  for (const s of slotLocations) modifiedSourceFiles.add(s.file)
  for (const t of textLocations) modifiedSourceFiles.add(t.file)
  for (const e of extractions) modifiedSourceFiles.add(e.pageFile)

  const lines: string[] = []

  // ---------------------------------------------------------------------------
  // Header
  // ---------------------------------------------------------------------------
  lines.push('# Invariance Migration Report')
  lines.push('')
  lines.push(`**App:** ${plan.config.app}`)
  lines.push(
    `**Naming:** ${semanticNaming ? 'Semantic (LLM-assisted via Opus)' : '⚠️  Deterministic fallback — rerun with `ANTHROPIC_API_KEY` set for meaningful slot and variable names'}`,
  )
  lines.push('')

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  lines.push('## Summary')
  lines.push('')
  lines.push(`| | |`)
  lines.push(`|---|---|`)
  lines.push(`| Pages scanned | ${extractions.length} |`)
  lines.push(`| Slots created | ${slotLocations.length} (${slotsWithVars.length} with CSS variables, ${slotsWithoutVars.length} layout wrappers) |`)
  lines.push(`| CSS variables generated | ${totalCssVars} |`)
  lines.push(`| Text nodes wrapped | ${textLocations.length} |`)
  lines.push(`| Source files modified | ${modifiedSourceFiles.size} |`)
  lines.push('')

  // ---------------------------------------------------------------------------
  // Pages
  // ---------------------------------------------------------------------------
  lines.push('## Pages')
  lines.push('')
  if (extractions.length === 0) {
    lines.push('_None discovered._')
  } else {
    for (const e of extractions) {
      lines.push(`- \`${e.page}\` — \`${rel(e.pageFile)}\``)
    }
  }
  lines.push('')

  // ---------------------------------------------------------------------------
  // Slots
  // ---------------------------------------------------------------------------
  lines.push('## Slots')
  lines.push('')
  if (slotLocations.length === 0) {
    lines.push('_No slots assigned._')
  } else {
    for (const slot of slotLocations) {
      const vars = plan.slotCssVariables[slot.name] ?? []
      const initialValues = plan.slotVariableInitialValues[slot.name] ?? {}
      const flags = [slot.preserve ? 'preserve' : null].filter(Boolean).join(', ')
      lines.push(`### \`${slot.name}\`${flags ? ` — ${flags}` : ''}`)
      lines.push('')
      lines.push(`- **File:** \`${rel(slot.file)}\``)
      lines.push(`- **JSX path:** \`${slot.jsxPath}\``)
      if (slot.description) {
        lines.push(`- **Description:** ${slot.description}`)
      }
      if (slot.aliases && slot.aliases.length > 0) {
        lines.push(`- **Aliases:** ${slot.aliases.map((a) => `\`${a}\``).join(', ')}`)
      }
      if (vars.length > 0) {
        lines.push(`- **CSS variables (${vars.length}):**`)
        lines.push('')
        lines.push('  | Variable | Initial value |')
        lines.push('  |----------|---------------|')
        for (const v of vars) {
          const val = initialValues[v] ?? '—'
          lines.push(`  | \`${v}\` | \`${val}\` |`)
        }
      } else {
        lines.push(
          `- **CSS variables:** none — layout wrapper, styles live in child slots`,
        )
      }
      lines.push('')
    }
  }

  // ---------------------------------------------------------------------------
  // Text Nodes
  // ---------------------------------------------------------------------------
  lines.push('## Text Nodes')
  lines.push('')
  if (textLocations.length === 0) {
    lines.push('_No text nodes wrapped._')
  } else {
    lines.push('| Name | Content | File |')
    lines.push('|------|---------|------|')
    for (const t of textLocations) {
      const content = textContentMap.get(`${t.file}::${t.jsxPath}`) ?? '—'
      const truncated = content.length > 40 ? `${content.slice(0, 40)}…` : content
      lines.push(`| \`${t.name}\` | "${truncated}" | \`${rel(t.file)}\` |`)
    }
  }
  lines.push('')

  // ---------------------------------------------------------------------------
  // Design tokens
  // ---------------------------------------------------------------------------
  const palette: string[] = []
  const paletteColors = plan.config.frontend?.design?.colors
  if (paletteColors && paletteColors.mode === 'palette') palette.push(...paletteColors.palette)

  lines.push('## Design Tokens')
  lines.push('')
  lines.push(`**Color palette (${palette.length}):** ${palette.map((c) => `\`${c}\``).join('  ')}`)
  lines.push('')
  const fonts = plan.config.frontend?.design?.fonts?.allowed ?? []
  lines.push(`**Fonts:** ${fonts.length > 0 ? fonts.join(', ') : '_none detected_'}`)
  lines.push('')
  const scale = plan.config.frontend?.design?.spacing?.scale ?? []
  lines.push(
    `**Spacing scale:** ${scale.length > 0 ? `\`[${scale.join(', ')}]\` px` : '_none detected_'}`,
  )
  lines.push('')

  // ---------------------------------------------------------------------------
  // Warnings
  // ---------------------------------------------------------------------------
  lines.push('## Warnings')
  lines.push('')

  const hasCollisions = collisionGroups.size > 0
  const hasNoVarWarnings = slotsWithoutVars.length > 0
  const hasNoCollisions = !hasCollisions && !hasNoVarWarnings

  if (hasNoCollisions && plan.warnings.length === 0) {
    lines.push('_None._')
  } else {
    if (hasCollisions) {
      lines.push('### Variable name collisions')
      lines.push('')
      lines.push(
        'These slots had multiple hardcoded values for the same CSS role. A numeric suffix was added to each to keep them distinct. Consider renaming in `invariance.config.yaml` after reviewing which value maps to which element.',
      )
      lines.push('')
      for (const [slotName, roleMap] of collisionGroups) {
        lines.push(`**\`${slotName}\`:**`)
        for (const [role, count] of roleMap) {
          const allVars = (plan.slotCssVariables[slotName] ?? []).filter((v) => {
            const suffix = v.split(`-${role}`)[1]
            return suffix === '' || /^-\d+$/.test(suffix ?? '')
          })
          const varList = allVars.length > 0
            ? allVars.map((v) => `\`${v}\``).join(', ')
            : `${count + 1} values`
          lines.push(`- ${count + 1} \`${role}\` values → ${varList}`)
        }
        lines.push('')
      }
    }

    if (hasNoVarWarnings) {
      lines.push('### Layout wrappers without CSS variables')
      lines.push('')
      lines.push(
        'These slots are structural containers. Their styles live in child slots and no CSS variables were generated for them.',
      )
      lines.push('')
      for (const slot of slotsWithoutVars) {
        lines.push(`- **\`${slot.name}\`** (\`${rel(slot.file)}\` → \`${slot.jsxPath}\`)`)
      }
      lines.push('')
    }
  }

  // ---------------------------------------------------------------------------
  // Files modified
  // ---------------------------------------------------------------------------
  lines.push('## Files Modified')
  lines.push('')
  lines.push('**Source files rewritten:**')
  for (const f of modifiedSourceFiles) lines.push(`- \`${rel(f)}\``)
  lines.push('')
  lines.push('**Generated files:**')
  lines.push('- `invariance.config.yaml` — invariant definitions (all slots locked at level 0)')
  lines.push('- `invariance.theme.initial.json` — original design token values')
  lines.push('- `src/app/providers.tsx` — InvarianceProvider wrapper')
  lines.push('- `src/app/layout.tsx` — patched to use Providers')
  lines.push('')

  // ---------------------------------------------------------------------------
  // Next steps
  // ---------------------------------------------------------------------------
  lines.push('## Next Steps')
  lines.push('')
  lines.push(
    '**All slots start locked (level 0) — no customization is enabled yet.** To unlock:',
  )
  lines.push('')
  lines.push('```bash')
  lines.push('npx invariance-unlock colors          # allow color changes on all slots')
  lines.push('npx invariance-unlock fonts           # allow font changes')
  lines.push('npx invariance-unlock page / --level 1  # set F1 (style) on the home page')
  lines.push('npx invariance-unlock all             # unlock everything')
  lines.push('```')
  lines.push('')
  lines.push('Or edit `invariance.config.yaml` directly — change `level: 0` to `level: 1` (F1 style) or higher on any page.')
  lines.push('')
  lines.push('**Set your API key** in `.env.local`:')
  lines.push('```')
  lines.push('NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY=sk-ant-...')
  lines.push('```')
  lines.push('')
  lines.push('**Start the dev server** and open the customization panel (bottom-right ✦ button).')
  lines.push('')

  return lines.join('\n')
}
