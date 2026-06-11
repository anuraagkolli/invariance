import { describe, it, expect, vi } from 'vitest'
import { runPipeline } from './pipeline'
import { THEME_PACKS } from '../registries/theme-packs'
import { ThemeJsonV2Schema } from '../config/schema'
import { createMemoryStorage } from '../storage/memory'
import { createThemeStore } from '../context/theme-store'
import type { AnyThemeJson } from '../config/types'
import type { SlotRegistration } from '../context/registry'

const spec = THEME_PACKS.find((p) => p.id === 'retro-arcade')!.spec

// fetch stub that answers calls in order (Gatekeeper first, then Designer/Builder
// /slot-edit calls). The last reply repeats for any extra calls.
const scriptedFetch = (replies: unknown[]) => {
  let i = 0
  return vi.fn().mockImplementation(async () => ({
    ok: true, status: 200,
    json: async () => ({
      content: [{ type: 'text', text: JSON.stringify(replies[Math.min(i++, replies.length - 1)]) }],
      stop_reason: 'end_turn',
    }),
  })) as unknown as typeof fetch
}

// Registry carrying a 'sidebar' slot with the CSS variables slot-edit needs.
const sidebarRegistry: SlotRegistration[] = [
  {
    name: 'sidebar',
    level: 1,
    pageName: '/',
    preserve: false,
    alternativesCount: 0,
    type: 'slot',
    cssVariables: ['--inv-sidebar-bg', '--inv-sidebar-text'],
  },
]

const context = (fetchFn: typeof fetch, registry: SlotRegistration[] = []) => ({
  registry,
  config: { app: 'demo', frontend: { pages: { '/': { level: 4 } } } },
  themeStore: createThemeStore(),
  storageBackend: createMemoryStorage(),
  apiKey: 'k',
  userId: 'u',
  appId: 'a',
  fetchFn,
})

describe('runPipeline THEME route', () => {
  it('classifies, designs, compiles, verifies, stores v2, applies', async () => {
    const fetchFn = scriptedFetch([
      { kind: 'THEME', description: 'retro restyle' },
      spec,
    ])
    const ctx = context(fetchFn)
    const result = await runPipeline('make it retro', [], ctx)
    expect(result.type).toBe('success')
    // The retro-arcade pack compiles warning-free so warnings must be absent (not []).
    if (result.type === 'success') expect(result.warnings).toBeUndefined()
    const stored = await ctx.storageBackend.loadTheme('u', 'a') as AnyThemeJson
    const parsed = ThemeJsonV2Schema.safeParse(stored)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(Object.keys(parsed.data.theme?.roles ?? {})).toHaveLength(22)
      expect(parsed.data.theme?.styleSpec?.fontPairing).toBe('retro-terminal')
    }
  })

  it('retries the Designer on an invalid spec, succeeds on the second', async () => {
    const fetchFn = scriptedFetch([
      { kind: 'THEME', description: 'retro' },
      { ...spec, accentHue: 999 },   // zod rejects post-receipt
      spec,
    ])
    const result = await runPipeline('make it retro', [], context(fetchFn))
    expect(result.type).toBe('success')
    expect(fetchFn).toHaveBeenCalledTimes(3)  // gatekeeper + designer x2
  })

  it('errors after the retry budget (2) is exhausted', async () => {
    const fetchFn = scriptedFetch([
      { kind: 'THEME', description: 'retro' },
      { ...spec, accentHue: 999 },
      { ...spec, accentHue: 999 },
      { ...spec, accentHue: 999 },
    ])
    const result = await runPipeline('make it retro', [], context(fetchFn))
    expect(result.type).toBe('error')
    expect(fetchFn).toHaveBeenCalledTimes(4)  // gatekeeper + designer x3 (initial + 2 retries)
  })

  it('preserves existing slot literals across a re-theme', async () => {
    const fetchFn = scriptedFetch([{ kind: 'THEME', description: 'retro' }, spec])
    const ctx = context(fetchFn)
    await ctx.storageBackend.saveTheme('u', 'a', {
      version: 2, base_app_version: 'v1',
      theme: { roles: {}, slots: { '--inv-header-bg': '#abcdef' } },
    } as AnyThemeJson)
    await runPipeline('make it retro', [], ctx)
    const stored = await ctx.storageBackend.loadTheme('u', 'a') as { theme?: { slots?: Record<string, string> } }
    expect(stored.theme?.slots?.['--inv-header-bg']).toBe('#abcdef')
  })

  it('routes CLARIFY straight through', async () => {
    const clarify = scriptedFetch([{ kind: 'CLARIFY', message: 'which area?' }])
    expect((await runPipeline('hm', [], context(clarify))).type).toBe('clarification')
  })
})

describe('runPipeline SLOT_F1 + Builder routes', () => {
  it('routes SLOT_F1 to the slot-edit micro-mutation and stores a v2 doc', async () => {
    const fetchFn = scriptedFetch([
      { kind: 'SLOT_F1', slotName: 'sidebar', level: 1, description: 'make the sidebar blue', requirements: [] },
      { targetVar: '--inv-sidebar-bg', hue: 250, chromaLevel: 'medium', lightness: 'same', explanation: 'Made the sidebar blue' },
    ])
    const ctx = context(fetchFn, sidebarRegistry)
    const result = await runPipeline('make the sidebar blue', [], ctx)
    expect(result.type).toBe('success')

    const stored = await ctx.storageBackend.loadTheme('u', 'a') as AnyThemeJson
    expect(stored.version).toBe(2)
    const parsed = ThemeJsonV2Schema.safeParse(stored)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.theme?.slots?.['--inv-sidebar-bg']).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('merges Builder sections onto the current v2 doc (fresh user gets v2, never v1)', async () => {
    const fetchFn = scriptedFetch([
      { kind: 'F3', slotName: 'banner', level: 3, description: 'hide the banner', requirements: [] },
      { mutation: { layout: { pages: { '/': { hidden: ['banner'] } } } }, explanation: 'Hid the banner' },
    ])
    const ctx = context(fetchFn)
    const result = await runPipeline('hide the banner', [], ctx)
    expect(result.type).toBe('success')

    const stored = await ctx.storageBackend.loadTheme('u', 'a') as AnyThemeJson
    expect(stored.version).toBe(2)
    const parsed = ThemeJsonV2Schema.safeParse(stored)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.layout?.pages['/']?.hidden).toEqual(['banner'])
    }
  })
})
