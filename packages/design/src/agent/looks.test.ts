import { describe, it, expect } from 'vitest'
import { buildLookContext, parseLooks, applyLookPicks } from './looks'
import { applyLayoutPreset } from './layout-profile'
import { applyPreview } from './pipeline-io'
import { createThemeStore } from '../context/theme-store'
import { resolveVariant, allowedPageVariants } from '../runtime/resolve-overrides'
import { verifyV2 } from '../verify/compiled-tests'
import { THEME_PACKS } from '../registries/theme-packs'
import type { InvarianceConfig, ThemeJsonV2 } from '../config/types'
import type { SlotRegistration } from '../context/registry'

const config: InvarianceConfig = {
  app: 'demo',
  frontend: {
    pages: { '/': { level: 4 }, '/locked': { level: 0 } },
    variants: { card: { options: ['poster', 'polaroid', 'caption'], default: 'poster' }, button: { options: ['solid', 'pill'] } },
  },
}
const slot = (name: string, level = 4, pageName = '/'): SlotRegistration => ({
  name, level: level as SlotRegistration['level'], pageName, preserve: false, alternativesCount: 0, type: 'slot',
})
const blank = (over: Partial<ThemeJsonV2> = {}): ThemeJsonV2 => ({ version: 2, base_app_version: 'v1', ...over })

describe('buildLookContext', () => {
  it('lists axes and the customizable slots on the current page', () => {
    const ctx = buildLookContext(config, [slot('row-trending'), slot('footer', 0)], blank({ variants: { card: 'caption' } }))
    expect(ctx?.axes.card).toEqual(['poster', 'polaroid', 'caption'])
    expect(ctx?.sections).toEqual(['row-trending'])
    expect(ctx?.pageAllowed).toBe(true)
    expect(ctx?.current.app).toEqual({ card: 'caption' })
  })
  it('offers no sections or page-only picks on a locked page', () => {
    const ctx = buildLookContext(config, [slot('row', 4, '/locked')], blank())
    expect(ctx?.sections).toEqual([])
    expect(ctx?.pageAllowed).toBe(false)
  })
  it('is undefined when the app declares no variant axes', () => {
    expect(buildLookContext({ app: 'demo' }, [], blank())).toBeUndefined()
  })
})

describe('parseLooks', () => {
  const ctx = buildLookContext(config, [slot('row-trending')], blank())!
  it('accepts allowed picks and maps this_page_only', () => {
    const r = parseLooks([{ axis: 'card', id: 'polaroid', section: 'row-trending' }, { axis: 'button', id: 'pill', this_page_only: true }], ctx)
    expect(r).toEqual({ ok: true, picks: [{ axis: 'card', id: 'polaroid', section: 'row-trending' }, { axis: 'button', id: 'pill', thisPageOnly: true }] })
  })
  it('rejects an id from another axis, an unknown axis and an unknown section', () => {
    const r = parseLooks([{ axis: 'card', id: 'pill' }, { axis: 'hero', id: 'split' }, { axis: 'card', id: 'poster', section: 'nope' }], ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.split('; ')).toHaveLength(3)
  })
  it('treats a missing looks field as no picks', () => {
    expect(parseLooks(undefined, ctx)).toEqual({ ok: true, picks: [] })
  })
})

describe('applyLookPicks + resolveVariant', () => {
  const ctx = buildLookContext(config, [slot('row-trending')], blank())!
  it('a section pick only changes that section', () => {
    const c = blank({ variants: { card: 'caption' } })
    applyLookPicks(c, [{ axis: 'card', id: 'polaroid', section: 'row-trending' }], ctx)
    expect(resolveVariant(c, config, 'card', { page: '/', slots: ['row-trending'] })).toBe('polaroid')
    expect(resolveVariant(c, config, 'card', { page: '/', slots: ['row-new'] })).toBe('caption')
    expect(c.page_variants).toEqual({ '/': { 'card@row-trending': 'polaroid' } })
  })
  it('a page-wide pick beats app-wide section picks on that page', () => {
    const c = blank({ variants: { 'card@row-trending': 'polaroid' } })
    applyLookPicks(c, [{ axis: 'card', id: 'caption', thisPageOnly: true }], ctx)
    expect(resolveVariant(c, config, 'card', { page: '/', slots: ['row-trending'] })).toBe('caption')
    expect(resolveVariant(c, config, 'card', { page: '/series', slots: ['row-trending'] })).toBe('polaroid')
  })
  it('a page-only pick wins on that page and nowhere else', () => {
    const c = blank()
    applyLookPicks(c, [{ axis: 'button', id: 'pill', thisPageOnly: true }], ctx)
    expect(resolveVariant(c, config, 'button', { page: '/' })).toBe('pill')
    expect(resolveVariant(c, config, 'button', { page: '/series' })).toBeUndefined()
  })
  it('an app-wide pick replaces narrower picks for that axis', () => {
    const c = blank({ variants: { 'card@row-trending': 'polaroid' }, page_variants: { '/': { card: 'caption', button: 'pill' } } })
    applyLookPicks(c, [{ axis: 'card', id: 'poster' }], ctx)
    expect(c.variants).toEqual({ card: 'poster' })
    expect(c.page_variants).toEqual({ '/': { button: 'pill' } })
  })
  it('ignores a scoped pick the config does not allow and falls back', () => {
    const c = blank({ variants: { card: 'caption', 'card@row-trending': 'tilt' } })
    expect(resolveVariant(c, config, 'card', { slots: ['row-trending'] })).toBe('caption')
  })
})

describe('verifyV2 variantsAllowed with scopes', () => {
  it('rejects a disallowed scoped pick and a pick on a locked page', () => {
    const r = verifyV2(blank({ variants: { 'card@row': 'tilt' }, page_variants: { '/locked': { card: 'poster' } } }), config, {})
    const check = r.results.find((t) => t.name === 'variantsAllowed')!
    expect(check.passed).toBe(false)
    expect(check.message).toContain('card@row')
    expect(check.message).toContain('/locked: page is locked')
  })
})

describe('allowedPageVariants', () => {
  it('drops picks for a page that has since been locked', () => {
    expect(allowedPageVariants({ '/locked': { card: 'poster' }, '/': { card: 'caption' } }, config)).toEqual({ '/': { card: 'caption' } })
  })
})

describe('applyLayoutPreset keeps picks within a profile', () => {
  const pack = THEME_PACKS.find((p) => p.id === 'neobrutalist')!
  const presetConfig: InvarianceConfig = { ...config, frontend: { ...config.frontend, layout_profiles: { brutal: { variants: { card: 'caption' } } } } }
  it('same profile: the user picks survive a re-theme', () => {
    const current = blank({ theme: { styleSpec: pack.spec }, variants: { card: 'polaroid' }, page_variants: { '/': { button: 'pill' } } })
    const c = blank()
    applyLayoutPreset(c, current, { ...pack.spec, accentHue: (pack.spec.accentHue + 30) % 360 }, presetConfig)
    expect(c.variants).toEqual({ card: 'polaroid' })
    expect(c.page_variants).toEqual({ '/': { button: 'pill' } })
  })
  it('new profile: the preset replaces every pick, page ones included', () => {
    const soft = THEME_PACKS.find((p) => p.id === 'soft-pastel')!
    const current = blank({ theme: { styleSpec: soft.spec }, variants: { card: 'polaroid' }, page_variants: { '/': { button: 'pill' } } })
    const c = blank()
    applyLayoutPreset(c, current, pack.spec, presetConfig)
    expect(c.variants).toEqual({ card: 'caption' })
    expect(c.page_variants).toBeUndefined()
  })
})

describe('applyPreview', () => {
  it('puts the candidate in the themeStore so anatomy previews too', () => {
    const themeStore = createThemeStore()
    const candidate = blank({ variants: { card: 'polaroid' } })
    applyPreview({ config, themeStore }, candidate)
    expect(themeStore.getTheme()).toBe(candidate)
  })
})
