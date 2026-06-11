import { describe, it, expect, vi } from 'vitest'
import { callDesigner } from './designer'
import { selectFewShotPacks, buildDesignerPrompt } from './designer-prompt'
import { styleSpecWireSchema } from './wire-schemas'
import { THEME_PACKS } from '../registries/theme-packs'
import { FONT_PAIRINGS } from '../registries/font-pairings'

const validSpec = THEME_PACKS[0].spec

const modelSays = (obj: unknown) => vi.fn().mockResolvedValue({
  ok: true, status: 200,
  json: async () => ({ content: [{ type: 'text', text: JSON.stringify(obj) }], stop_reason: 'end_turn' }),
} as unknown as Response)

describe('callDesigner', () => {
  it('returns a zod-valid StyleSpec', async () => {
    const r = await callDesigner({ request: 'make it retro', constraints: {}, apiKey: 'k', fetchFn: modelSays(validSpec) })
    expect(r).toEqual({ ok: true, spec: validSpec })
  })

  it('rejects an out-of-range hue the wire schema cannot bound', async () => {
    const r = await callDesigner({
      request: 'x', constraints: {}, apiKey: 'k',
      fetchFn: modelSays({ ...validSpec, accentHue: 999 }),
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.retryable).toBe(true)
      expect(r.error).toContain('accentHue')
    }
  })

  it('maps transport failure to non-retryable error', async () => {
    const dead = vi.fn().mockRejectedValue(new Error('net')) as unknown as typeof fetch
    const r = await callDesigner({ request: 'x', constraints: {}, apiKey: 'k', fetchFn: dead })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.retryable).toBe(false)
  })

  it('returns non-retryable error when font_registry has no valid pairing ids (all typos)', async () => {
    // A config that lists only typo'd ids — none exist in the registry.
    const r = await callDesigner({
      request: 'make it retro',
      constraints: { font_registry: ['does-not-exist', 'also-wrong'] },
      apiKey: 'k',
      // No fetchFn needed — should fail before the API call.
      fetchFn: vi.fn() as unknown as typeof fetch,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.retryable).toBe(false)
      expect(r.error).toContain('font_registry')
    }
  })
})

describe('styleSpecWireSchema', () => {
  it('obeys the dialect and pins fontPairing to the registry', () => {
    const s = styleSpecWireSchema(FONT_PAIRINGS.map((p) => p.id))
    const text = JSON.stringify(s)
    expect(text).not.toContain('"minimum"')
    expect(text).not.toContain('"maximum"')
    expect(text).not.toContain('"minLength"')
    expect(s.additionalProperties).toBe(false)
    expect((s.properties.fontPairing as { enum: string[] }).enum).toContain('retro-terminal')
  })
})

describe('selectFewShotPacks', () => {
  it('ranks by tag overlap: "make it brutalist" selects neobrutalist first', () => {
    const picks = selectFewShotPacks('make it brutalist and bold', THEME_PACKS, 3)
    expect(picks).toHaveLength(3)
    expect(picks[0].id).toBe('neobrutalist')
  })

  it('is deterministic with zero overlap (registry order)', () => {
    const a = selectFewShotPacks('zzz', THEME_PACKS, 3).map((p) => p.id)
    const b = selectFewShotPacks('zzz', THEME_PACKS, 3).map((p) => p.id)
    expect(a).toEqual(b)
    expect(a).toEqual(THEME_PACKS.slice(0, 3).map((p) => p.id))
  })
})

describe('buildDesignerPrompt', () => {
  it('contains the constraint block, role vocabulary, and exactly three packs', () => {
    const prompt = buildDesignerPrompt({
      constraints: { locked_tokens: { '--inv-accent': '#e94560' }, accent_chroma_max: 0.2 },
      fewShot: selectFewShotPacks('retro', THEME_PACKS, 3),
    })
    expect(prompt).toContain('--inv-accent')
    expect(prompt).toContain('--inv-surface-0')
    expect((prompt.match(/"rationale"/g) ?? []).length).toBe(3)
  })
})
