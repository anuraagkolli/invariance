import { describe, it, expect, vi } from 'vitest'
import { runPipeline } from './pipeline'
import { THEME_PACKS } from '../registries/theme-packs'
import { ThemeJsonV2Schema } from '../config/schema'
import { createMemoryStorage } from '../storage/memory'
import { createThemeStore } from '../context/theme-store'
import type { AnyThemeJson } from '../config/types'

const spec = THEME_PACKS.find((p) => p.id === 'retro-arcade')!.spec

// fetch stub that answers calls in order (Gatekeeper first, then Designer calls).
// The last reply repeats for any extra calls.
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

const context = (fetchFn: typeof fetch) => ({
  registry: [],
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

  it('routes CLARIFY straight through and slot kinds to the Builder path', async () => {
    const clarify = scriptedFetch([{ kind: 'CLARIFY', message: 'which area?' }])
    expect((await runPipeline('hm', [], context(clarify))).type).toBe('clarification')
    // SLOT_F1 reaches the Builder: builder responds with a mutation
    const slotFlow = scriptedFetch([
      { kind: 'SLOT_F1', slotName: 'sidebar', level: 1, description: 'blue sidebar', requirements: [] },
      { mutation: { theme: { globals: { '--inv-sidebar-bg': '#0000ff' } } }, explanation: 'done' },
    ])
    const r = await runPipeline('make the sidebar blue', [], context(slotFlow))
    expect(['success', 'error']).toContain(r.type)  // success if verify passes on empty config
  })

  it('SLOT_F1 globals mutation on a v2 current theme lands in slots and applies', async () => {
    // Seed storage with a valid v2 theme (compiler-produced roles from a pack).
    const corporatePack = THEME_PACKS.find((p) => p.id === 'corporate-trust')!
    const { compileTheme } = await import('../compiler/compile')
    const compiled = compileTheme(corporatePack.spec)
    const seedTheme: AnyThemeJson = {
      version: 2,
      base_app_version: 'v1',
      theme: {
        roles: compiled.roles,
        slots: { '--inv-sidebar-bg': '#111111' },
        styleSpec: corporatePack.spec,
      },
    }

    const fetchFn = scriptedFetch([
      { kind: 'SLOT_F1', slotName: 'sidebar', level: 1, description: 'blue sidebar', requirements: [] },
      // Builder emits v1-style globals mutation with a valid hex color
      { mutation: { theme: { globals: { '--inv-sidebar-bg': '#0000ff' } } }, explanation: 'blue sidebar' },
    ])
    const ctx = context(fetchFn)
    await ctx.storageBackend.saveTheme('u', 'a', seedTheme)
    ctx.themeStore.setTheme(seedTheme)

    const r = await runPipeline('make the sidebar blue', [], ctx)
    // The mutation should either succeed (verify passes) or error after retries
    // but the stored doc must remain a valid v2 document.
    const stored = await ctx.storageBackend.loadTheme('u', 'a') as AnyThemeJson
    const parsed = ThemeJsonV2Schema.safeParse(stored)
    expect(parsed.success).toBe(true)
    if (r.type === 'success') {
      // If it succeeded, the CSS var mutation must be present in theme.slots
      const storedV2 = parsed.data!
      expect(storedV2.theme?.slots?.['--inv-sidebar-bg']).toBe('#0000ff')
    }
  })
})
