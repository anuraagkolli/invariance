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
    const saveSpy = vi.spyOn(ctx.storageBackend, 'saveTheme')
    const result = await runPipeline('make it retro', [], ctx)
    expect(result.type).toBe('success')
    // The retro-arcade pack compiles warning-free so warnings must be absent (not []).
    if (result.type === 'success') expect(result.warnings).toBeUndefined()
    // Provenance reaches the backend: the prompt + route that produced the save.
    expect(saveSpy).toHaveBeenCalledWith('u', 'a', expect.anything(), {
      prompt: 'make it retro', source: 'pipeline', description: spec.rationale,
    })
    const stored = await ctx.storageBackend.loadTheme('u', 'a') as AnyThemeJson
    const parsed = ThemeJsonV2Schema.safeParse(stored)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(Object.keys(parsed.data.theme?.roles ?? {})).toHaveLength(38)
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
    const saveSpy = vi.spyOn(ctx.storageBackend, 'saveTheme')
    const result = await runPipeline('make the sidebar blue', [], ctx)
    expect(result.type).toBe('success')
    expect(saveSpy).toHaveBeenCalledWith('u', 'a', expect.anything(), {
      prompt: 'make the sidebar blue', source: 'pipeline', description: 'Made the sidebar blue',
    })

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
    // The gatekeeper's deterministic gate requires a registered slot at a
    // sufficient level — F3 implies level 3, and the page must allow it too.
    const bannerRegistry: SlotRegistration[] = [{
      name: 'banner', level: 3, pageName: '/', preserve: false,
      alternativesCount: 0, type: 'slot', cssVariables: [],
    }]
    const ctx = context(fetchFn, bannerRegistry)
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

// OpenAI-shaped scripted fetch — same in-order contract as scriptedFetch but the
// choices[].message.content wire shape, so the openai-compatible transport reads it.
const scriptedOaiFetch = (replies: unknown[]) => {
  let i = 0
  return vi.fn().mockImplementation(async () => ({
    ok: true, status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(replies[Math.min(i++, replies.length - 1)]) }, finish_reason: 'stop' }],
    }),
  })) as unknown as typeof fetch
}

describe('runPipeline provider seam threading', () => {
  it('threads llmProvider + per-role model + baseUrl down to the actual fetch call', async () => {
    const fetchFn = scriptedOaiFetch([
      { kind: 'THEME', description: 'retro' },
      spec,
    ])
    const ctx = {
      ...context(fetchFn),
      fetchFn,
      apiBaseUrl: 'http://localhost:11434/v1',
      llmProvider: 'openai-compatible' as const,
      oaiStructuredMode: 'json_object' as const,
      models: { gatekeeper: 'qwen2.5', designer: 'qwen2.5', builder: 'qwen2.5', slotEdit: 'qwen2.5' },
    }
    const result = await runPipeline('make it retro', [], ctx)
    expect(result.type).toBe('success')

    // Gatekeeper call (first) went to the OpenAI-compatible endpoint with the per-role model.
    const calls = (fetchFn as unknown as { mock: { calls: [string, { headers: Record<string, string>; body: string }][] } }).mock.calls
    const [gkUrl, gkInit] = calls[0]
    expect(gkUrl).toBe('http://localhost:11434/v1/chat/completions')
    expect(gkInit.headers['Authorization']).toBe('Bearer k')
    const gkBody = JSON.parse(gkInit.body)
    expect(gkBody.model).toBe('qwen2.5')
    expect(gkBody.messages[0].role).toBe('system')
    // json_object fallback: the structured-output schema is inlined into the system prompt.
    expect(gkBody.response_format).toEqual({ type: 'json_object' })

    // Designer call (second) carried its own per-role model too.
    const designerBody = JSON.parse(calls[1][1].body)
    expect(designerBody.model).toBe('qwen2.5')
  })
})
