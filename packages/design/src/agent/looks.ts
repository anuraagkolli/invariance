import type { InvarianceConfig, ThemeJsonV2, VariantsSection } from '../config/types'
import type { SlotRegistration } from '../context/registry'
import { variantAxis } from '../runtime/resolve-overrides'

// What the Designer may pick directly: the developer's allowed looks per axis
// and the slots on the page the user is looking at.
export interface LookContext {
  axes: Record<string, string[]>
  page: string
  // Slots on `page` the user may target (slot level and page level >= 1).
  sections: string[]
  // Page-only picks are allowed (page level >= 1).
  pageAllowed: boolean
  current: { app: VariantsSection; page: VariantsSection }
}

export interface LookPick {
  axis: string
  id: string
  section?: string
  thisPageOnly?: boolean
}

const SCOPE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function buildLookContext(
  config: InvarianceConfig,
  registry: SlotRegistration[],
  current: ThemeJsonV2,
): LookContext | undefined {
  const axes: Record<string, string[]> = {}
  for (const [axis, cfg] of Object.entries(config.frontend?.variants ?? {})) axes[axis] = [...cfg.options]
  if (Object.keys(axes).length === 0) return undefined
  const page = registry[0]?.pageName ?? '/'
  const pageAllowed = (config.frontend?.pages?.[page]?.level ?? 0) >= 1
  const sections = pageAllowed
    ? [...new Set(registry.filter((r) => r.pageName === page && r.level >= 1 && SCOPE.test(r.name)).map((r) => r.name))]
    : []
  return { axes, page, sections, pageAllowed, current: { app: current.variants ?? {}, page: current.page_variants?.[page] ?? {} } }
}

// Validate the Designer's `looks` against the context. Anything outside the
// allowed axes/options/sections is a retryable error, never silently applied.
export function parseLooks(raw: unknown, ctx: LookContext | undefined): { ok: true; picks: LookPick[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null || !ctx) return { ok: true, picks: [] }
  if (!Array.isArray(raw)) return { ok: false, error: 'looks: must be an array' }
  const picks: LookPick[] = []
  const issues: string[] = []
  raw.forEach((item: unknown, i) => {
    const o = (item ?? {}) as { axis?: unknown; id?: unknown; section?: unknown; this_page_only?: unknown }
    const axis = typeof o.axis === 'string' ? o.axis : ''
    const id = typeof o.id === 'string' ? o.id : ''
    const options = ctx.axes[axis]
    if (!options) return void issues.push(`looks.${i}.axis: '${axis}' is not one of [${Object.keys(ctx.axes).join(', ')}]`)
    if (!options.includes(id)) return void issues.push(`looks.${i}.id: '${id}' is not a ${axis} look [${options.join(', ')}]`)
    const pick: LookPick = { axis, id }
    if (o.section !== undefined) {
      if (typeof o.section !== 'string' || !ctx.sections.includes(o.section)) {
        return void issues.push(`looks.${i}.section: must be one of [${ctx.sections.join(', ')}]`)
      }
      pick.section = o.section
    }
    if (o.this_page_only === true) {
      if (!ctx.pageAllowed) return void issues.push(`looks.${i}.this_page_only: this page is locked`)
      pick.thisPageOnly = true
    }
    picks.push(pick)
  })
  return issues.length > 0 ? { ok: false, error: issues.join('; ') } : { ok: true, picks }
}

const withoutAxis = (v: VariantsSection | undefined, axis: string): VariantsSection =>
  Object.fromEntries(Object.entries(v ?? {}).filter(([k]) => variantAxis(k) !== axis))

// Write the Designer's picks onto the candidate. A section pick sets only
// `axis@section`; an app-wide or page-wide pick for an axis replaces the
// narrower picks for that axis it covers, so "all cards poster" really is all.
export function applyLookPicks(candidate: ThemeJsonV2, picks: LookPick[], ctx: LookContext): void {
  let variants: VariantsSection = { ...(candidate.variants ?? {}) }
  const pageVariants: Record<string, VariantsSection> = { ...(candidate.page_variants ?? {}) }
  for (const pick of picks) {
    const key = pick.section ? `${pick.axis}@${pick.section}` : pick.axis
    if (pick.thisPageOnly) {
      const onPage = pick.section ? { ...(pageVariants[ctx.page] ?? {}) } : withoutAxis(pageVariants[ctx.page], pick.axis)
      pageVariants[ctx.page] = { ...onPage, [key]: pick.id }
    } else if (pick.section) {
      variants[key] = pick.id
    } else {
      variants = { ...withoutAxis(variants, pick.axis), [key]: pick.id }
      for (const page of Object.keys(pageVariants)) pageVariants[page] = withoutAxis(pageVariants[page], pick.axis)
    }
  }
  for (const page of Object.keys(pageVariants)) {
    if (Object.keys(pageVariants[page] ?? {}).length === 0) delete pageVariants[page]
  }
  if (Object.keys(variants).length > 0) candidate.variants = variants
  else delete candidate.variants
  if (Object.keys(pageVariants).length > 0) candidate.page_variants = pageVariants
  else delete candidate.page_variants
}
