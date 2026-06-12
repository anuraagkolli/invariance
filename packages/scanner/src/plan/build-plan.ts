import yaml from 'js-yaml'

import { ConfigValidationError, parseConfig, ThemeJsonV2Schema } from 'invariance'
import type { InvarianceConfig, ThemeJsonV2 } from 'invariance'

import type {
  MigrationPlan,
  ObservedValue,
  SemanticResult,
  SourceEdit,
  StaticExtraction,
} from '../types'
import { buildSlotPlan } from './slot-plan'
import { buildTextPlan } from './text-plan'
import { clusterColors } from '../roles/cluster'
import type { ColorKind, ColorObservation } from '../roles/cluster'

// ---------------------------------------------------------------------------
// Naming helpers (inline fallback until ../emit/variable-naming lands)
// ---------------------------------------------------------------------------

const ROLE_ABBREV: Record<string, string> = {
  bg: 'bg',
  background: 'bg',
  'background-color': 'bg',
  text: 'text',
  color: 'text',
  border: 'border',
  'border-color': 'border',
  font: 'font',
  'font-family': 'font',
  pad: 'pad',
  padding: 'pad',
  margin: 'margin',
  radius: 'radius',
  'border-radius': 'radius',
}

function abbrev(role: string): string {
  return ROLE_ABBREV[role] ?? role.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function kebabCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function baseVarName(slot: string, role: string): string {
  return `--inv-${kebabCase(slot)}-${abbrev(role)}`
}

// ---------------------------------------------------------------------------
// Hex normalization and unique aggregation
// ---------------------------------------------------------------------------

function normalizeHex(value: string): string | undefined {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value.trim())
  if (!m) return undefined
  let hex = m[1] as string
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('')
  }
  return `#${hex.toUpperCase()}`
}

function uniqueSorted<T>(values: Iterable<T>): T[] {
  return Array.from(new Set(values)).sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b
    return String(a).localeCompare(String(b))
  })
}

function parseSpacingValue(value: string): number | undefined {
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim())
  if (!m || !m[1]) return undefined
  const n = Number.parseFloat(m[1])
  return Number.isFinite(n) ? n : undefined
}

// ---------------------------------------------------------------------------
// Main planner
// ---------------------------------------------------------------------------

export interface BuildMigrationPlanParams {
  appName: string
  extractions: StaticExtraction[]
  semantics: SemanticResult[]
  tailwindLoaded: boolean
}

export function buildMigrationPlan(params: BuildMigrationPlanParams): MigrationPlan {
  const warnings: string[] = []
  if (!params.tailwindLoaded) {
    warnings.push(
      'No tailwind.config loaded — tailwind classes were not resolved and may be missing from the palette.',
    )
  }

  // ---- Aggregate globals from all extractions ------------------------------
  const colorSet = new Set<string>()
  const fontSet = new Set<string>()
  const spacingSet = new Set<number>()

  for (const ex of params.extractions) {
    for (const c of ex.allColors) {
      const hex = normalizeHex(c)
      if (hex) colorSet.add(hex)
      else warnings.push(`Unresolved color value '${c}' on page ${ex.page}`)
    }
    for (const f of ex.allFonts) {
      if (f.trim().length > 0) fontSet.add(f.trim())
    }
    for (const s of ex.allSpacings) {
      if (Number.isFinite(s) && s >= 0) spacingSet.add(s)
    }
  }

  const palette = uniqueSorted(colorSet)
  const fonts = uniqueSorted(fontSet)
  const spacings = uniqueSorted(spacingSet)

  // ---- Index semantic results by page --------------------------------------
  const semanticByPage = new Map<string, SemanticResult>()
  for (const sem of params.semantics) {
    semanticByPage.set(sem.page, sem)
  }

  // ---- Per-page slot plans -------------------------------------------------
  const allSlotNames = new Set<string>()
  const slotCssVariables: Record<string, string[]> = {}
  const slotVariableInitialValues: Record<string, Record<string, string>> = {}
  const sourceEdits: SourceEdit[] = []

  // Role clustering inputs/side-data:
  //  - colorObservations: every observed color with its CSS property kind, the
  //    raw material the deterministic clusterer turns into role tokens.
  //  - slotVarMeta: each emitted slot variable's (kind, normalized hex), so we
  //    can rewrite its initial value to a var(--inv-<role>) reference when the
  //    value belongs to a role cluster.
  const colorObservations: ColorObservation[] = []
  const slotVarMeta = new Map<string, { kind: ColorKind; hex: string }>()

  // Track first/last from the first page's sectionOrder for section_order hints.
  let firstSlot: string | undefined
  let lastSlot: string | undefined

  for (const extraction of params.extractions) {
    const semantic = semanticByPage.get(extraction.page)
    if (!semantic) {
      warnings.push(`No semantic result for page ${extraction.page}, skipping slot plan`)
      continue
    }

    const slotPlan = buildSlotPlan(extraction, semantic)
    const textPlan = buildTextPlan(extraction, semantic)

    if (!firstSlot && semantic.sectionOrder.length > 0) {
      firstSlot = semantic.sectionOrder[0]
      lastSlot = semantic.sectionOrder[semantic.sectionOrder.length - 1]
    }

    // Track which values across the whole page ended up unassigned.
    const assignedKeys = new Set<string>()

    for (const entry of slotPlan) {
      const slotName = entry.semanticSlot.name
      allSlotNames.add(slotName)

      if (!slotCssVariables[slotName]) slotCssVariables[slotName] = []
      if (!slotVariableInitialValues[slotName]) slotVariableInitialValues[slotName] = {}

      if (entry.values.length === 0) {
        warnings.push(
          `Slot '${slotName}' on page ${extraction.page} has no observed design values; no CSS variables generated`,
        )
        sourceEdits.push({
          file: entry.semanticSlot.file,
          kind: 'wrap-slot',
          description: `Wrap ${slotName} (no observed values) at ${entry.semanticSlot.jsxPath}`,
        })
        continue
      }

      // Map (role, value) -> variable name. Collisions on role with a
      // different value get a numeric suffix.
      const roleValueToVar = new Map<string, string>()
      const roleValueCount = new Map<string, number>()

      for (const value of entry.values) {
        // Normalize hex colors so palette, globals and rewritten source agree on case.
        const canonical = normalizeHex(value.value) ?? value.value
        const key = `${value.role}::${canonical}`
        let varName = roleValueToVar.get(key)
        if (!varName) {
          const base = baseVarName(slotName, value.role)
          const count = roleValueCount.get(value.role) ?? 0
          if (count === 0) {
            varName = base
          } else {
            varName = `${base}-${count}`
            warnings.push(
              `Slot '${slotName}' has multiple values for role '${value.role}'; collision suffix -${count} applied`,
            )
          }
          roleValueCount.set(value.role, count + 1)
          roleValueToVar.set(key, varName)

          slotCssVariables[slotName]!.push(varName)
          slotVariableInitialValues[slotName]![varName] = canonical

          // Record the (kind, hex) for color variables so role-clustering can
          // later rewrite this slot var to a var(--inv-<role>) reference.
          const kind = colorKind(value.role)
          if (kind) slotVarMeta.set(varName, { kind, hex: canonical })
        }

        // Feed every color observation (with its kind) into the clusterer. We
        // count per-occurrence (not per unique var) so the most-used value wins
        // representative selection — e.g. white observed on two backgrounds.
        const obsKind = colorKind(value.role)
        if (obsKind) colorObservations.push({ hex: canonical, kind: obsKind })

        sourceEdits.push({
          file: value.file,
          kind: 'rewrite-value',
          description: `Rewire ${value.role}=${canonical} to var(${varName}) for slot ${slotName}`,
        })

        assignedKeys.add(`${value.file}::${value.role}::${value.value}`)
      }

      sourceEdits.push({
        file: entry.semanticSlot.file,
        kind: 'wrap-slot',
        description: `Wrap slot ${slotName} at ${entry.semanticSlot.jsxPath}`,
      })
    }

    for (const text of textPlan) {
      sourceEdits.push({
        file: text.file,
        kind: 'wrap-text',
        description: `Wrap m.text name='${text.name}' at ${text.jsxPath}`,
      })
    }

    sourceEdits.push({
      file: extraction.pageFile,
      kind: 'wrap-page',
      description: `Wrap m.page for ${extraction.page}`,
    })
    sourceEdits.push({
      file: extraction.pageFile,
      kind: 'add-import',
      description: `Add import { m } from 'invariance' to ${extraction.pageFile}`,
    })

    // Report unassigned observed values for this page.
    const unassignedCount = countUnassigned(extraction, assignedKeys)
    if (unassignedCount > 0) {
      warnings.push(
        `${unassignedCount} observed design value(s) on page ${extraction.page} did not match any slot`,
      )
    }
  }

  // ---- Build InvarianceConfig ---------------------------------------------
  const requiredSections = uniqueSorted(allSlotNames)
  const lockedSections = [...requiredSections]

  let config: InvarianceConfig = {
    app: params.appName,
    frontend: {
      design: {
        colors:
          palette.length > 0
            ? { mode: 'palette', palette }
            : { mode: 'any' },
        ...(fonts.length > 0 ? { fonts: { allowed: fonts } } : {}),
        ...(spacings.length > 0 ? { spacing: { scale: spacings } } : {}),
        // v6 relational constraints: these (not exact-hex allowlists) are the
        // default. They let an unlocked F1 immediately produce high-quality,
        // AA-compliant themes — the compiler reads them as floors/ceilings.
        constraints: {
          contrast: '>= 4.5',
          accent_chroma_max: 0.25,
          font_registry: 'default',
        },
      },
      structure: {
        required_sections: requiredSections,
        locked_sections: lockedSections,
        section_order: {
          ...(firstSlot ? { first: firstSlot } : {}),
          ...(lastSlot ? { last: lastSlot } : {}),
        },
      },
      accessibility: {
        wcag_level: 'AA',
        color_contrast: '>= 4.5',
        all_images: 'must have alt text',
      },
      pages: buildPagesRecord(params.extractions, semanticByPage),
    },
  }

  // ---- Validate & relax ----------------------------------------------------
  try {
    const yamlString = yaml.dump(config)
    config = parseConfig(yamlString)
  } catch (err) {
    if (err instanceof ConfigValidationError) {
      for (const issue of err.issues) {
        warnings.push(`config validation: ${issue}`)
      }
    } else {
      warnings.push(`config validation: ${(err as Error).message}`)
    }
    config = relaxConfig(config, warnings)
  }

  // ---- Cluster colors into roles ------------------------------------------
  const assignment = clusterColors(colorObservations)
  for (const w of assignment.warnings) warnings.push(`Role clustering: ${w}`)

  const roles: Record<string, string> = { ...assignment.roles }

  // Fonts: seed --inv-font-body from the primary observed family, and
  // --inv-font-display only when a distinct heading family is also observed.
  // We NEVER invent a font we didn't see — an app with no font observations
  // leaves both unfilled (the compiler supplies them on the first theme edit).
  // `fonts` is the deduped, sorted set of observed families (computed above);
  // the aggregation does not track per-family counts, so we take the first as
  // body and the next distinct family as display. (Single-font apps — the
  // common case and the fixture — fill only body.)
  const families = fonts
  if (families.length > 0) {
    const body = families[0]!
    roles['--inv-font-body'] = body
    const display = families.find((f) => f !== body)
    if (display) roles['--inv-font-display'] = display
  } else {
    warnings.push('Role clustering: no font family observed — font roles unfilled (compiler will supply them)')
  }

  // ---- Build slot tokens: var(--inv-<role>) refs where the value clustered --
  // For every slot variable holding a color, if its (kind, hex) belongs to a
  // role cluster, the slot token becomes a var() reference into the role tier;
  // otherwise it keeps its literal. Fonts/spacing slot vars stay literals.
  const slots: Record<string, string> = {}
  for (const [slotName, vars] of Object.entries(slotCssVariables)) {
    const initials = slotVariableInitialValues[slotName] ?? {}
    for (const varName of vars) {
      const literal = initials[varName]
      if (literal === undefined) continue
      const meta = slotVarMeta.get(varName)
      const role = meta ? assignment.varToRole.get(`${meta.kind}:${meta.hex}`) : undefined
      slots[varName] = role ? `var(${role})` : literal
    }
  }

  // ---- Build initial theme.json v2 ----------------------------------------
  // Set roles/slots only when non-empty; exactOptionalPropertyTypes forbids
  // assigning `undefined` to these optional fields explicitly.
  const themeSection: ThemeJsonV2['theme'] = {}
  if (Object.keys(roles).length > 0) themeSection!.roles = roles
  if (Object.keys(slots).length > 0) themeSection!.slots = slots
  const initialThemeCandidate: ThemeJsonV2 = {
    version: 2,
    base_app_version: 'v1',
    theme: themeSection,
  }
  // Validate the emitted theme against the canonical schema — a malformed
  // initial theme would be rejected by the provider's verify-on-load anyway, so
  // fail loudly here at scan time instead of shipping a broken artifact.
  const parsed = ThemeJsonV2Schema.safeParse(initialThemeCandidate)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Scanner: emitted initial theme failed ThemeJsonV2Schema: ${issues}`)
  }
  const initialTheme: ThemeJsonV2 = initialThemeCandidate

  return {
    config,
    initialTheme,
    sourceEdits,
    slotCssVariables,
    slotVariableInitialValues,
    warnings,
  }
}

// Narrow an observed CSS role to the color kinds the clusterer understands.
// Non-color roles (font, pad, radius, margin) return undefined.
function colorKind(role: string): ColorKind | undefined {
  if (role === 'bg' || role === 'text' || role === 'border') return role
  return undefined
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPagesRecord(
  extractions: StaticExtraction[],
  semanticByPage: Map<string, SemanticResult>,
): Record<string, { level: number; required?: string[] }> {
  const pages: Record<string, { level: number; required?: string[] }> = {}
  for (const ex of extractions) {
    const sem = semanticByPage.get(ex.page)
    if (!sem) continue
    const required = sem.slots.map((s) => s.name)
    pages[ex.page] = required.length > 0 ? { level: 0, required } : { level: 0 }
  }
  return pages
}

function countUnassigned(
  extraction: StaticExtraction,
  assigned: Set<string>,
): number {
  let count = 0
  for (const section of extraction.sections) {
    for (const v of section.values) {
      if (!assigned.has(`${v.file}::${v.role}::${v.value}`)) count += 1
    }
  }
  return count
}

function relaxConfig(config: InvarianceConfig, warnings: string[]): InvarianceConfig {
  const relaxed: InvarianceConfig = {
    app: config.app,
    frontend: {
      ...(config.frontend ?? {}),
    },
  }

  if (relaxed.frontend?.design) {
    const design = { ...relaxed.frontend.design }
    if (
      design.colors &&
      design.colors.mode === 'palette' &&
      (!Array.isArray(design.colors.palette) || design.colors.palette.length === 0)
    ) {
      // Fail loudly instead of silently downgrading: an empty palette means
      // extraction found no colors (usually because source was already migrated
      // to var(--inv-*) refs). Downgrading to mode:any turns off palette
      // enforcement app-wide, which is never what the user wants.
      throw new Error(
        'Scanner: extracted an empty color palette. Refusing to downgrade ' +
          'colors.mode from "palette" to "any". Ensure source contains literal ' +
          'color values (hex/rgb) before running the scanner — re-migration of ' +
          'already-wrapped source is not supported.',
      )
    }
    relaxed.frontend.design = design
  }

  if (relaxed.frontend?.pages) {
    const pages: Record<string, { level: number; required?: string[] }> = {}
    for (const [pagePath, pageCfg] of Object.entries(relaxed.frontend.pages)) {
      if (!pageCfg.required || pageCfg.required.length === 0) {
        warnings.push(`Relaxed page ${pagePath}: skipped (no slots)`)
        continue
      }
      pages[pagePath] = pageCfg
    }
    relaxed.frontend.pages = pages
  }

  return relaxed
}
