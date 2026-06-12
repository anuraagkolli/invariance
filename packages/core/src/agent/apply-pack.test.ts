import { describe, it, expect, vi } from 'vitest'

import { applyPack, availablePacks } from './apply-pack'
import { THEME_PACKS } from '../registries/theme-packs'
import { ThemeJsonV2Schema } from '../config/schema'
import { createMemoryStorage } from '../storage/memory'
import { createThemeStore } from '../context/theme-store'
import type { AnyThemeJson, InvarianceConfig } from '../config/types'
import type { PipelineIoContext } from './pipeline-io'

const ioContext = (config: InvarianceConfig): PipelineIoContext => ({
  config,
  themeStore: createThemeStore(),
  storageBackend: createMemoryStorage(),
  userId: 'u',
  appId: 'a',
})

describe('applyPack', () => {
  it('persists a v2 doc carrying the pack roles + styleSpec (no apiKey, no LLM)', async () => {
    const ctx = ioContext({ app: 'demo' })
    const saveSpy = vi.spyOn(ctx.storageBackend, 'saveTheme')
    const result = await applyPack('retro-arcade', ctx)
    expect(result.type).toBe('success')
    // Provenance: the pack name stands in for a typed prompt on this route.
    const pack = THEME_PACKS.find((p) => p.id === 'retro-arcade')!
    expect(saveSpy).toHaveBeenCalledWith('u', 'a', expect.anything(), {
      prompt: pack.name, source: 'pack', description: pack.spec.rationale,
    })
    if (result.type === 'success') {
      expect(result.slotName).toBe('theme')
      // description is the pack's own rationale (provenance for the panel bubble).
      expect(result.description).toBe(
        THEME_PACKS.find((p) => p.id === 'retro-arcade')!.spec.rationale,
      )
    }

    const stored = (await ctx.storageBackend.loadTheme('u', 'a')) as AnyThemeJson
    const parsed = ThemeJsonV2Schema.safeParse(stored)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      // Full 22-token compiler output, with the pack's spec attached as provenance.
      expect(Object.keys(parsed.data.theme?.roles ?? {})).toHaveLength(22)
      expect(parsed.data.theme?.styleSpec?.fontPairing).toBe('retro-terminal')
    }
    // Same doc lives in the in-memory store (panel reads it post-apply).
    expect(ctx.themeStore.getTheme()?.version).toBe(2)
  })

  it('errors on an unknown pack id', async () => {
    const result = await applyPack('does-not-exist', ioContext({ app: 'demo' }))
    expect(result).toEqual({ type: 'error', message: 'Unknown theme pack.' })
  })

  it('preserves existing slot literals when applying a pack', async () => {
    const ctx = ioContext({ app: 'demo' })
    await ctx.storageBackend.saveTheme('u', 'a', {
      version: 2,
      base_app_version: 'v1',
      theme: { roles: {}, slots: { '--inv-header-bg': '#abcdef' } },
    } as AnyThemeJson)

    await applyPack('ocean', ctx)
    const stored = (await ctx.storageBackend.loadTheme('u', 'a')) as {
      theme?: { slots?: Record<string, string> }
    }
    expect(stored.theme?.slots?.['--inv-header-bg']).toBe('#abcdef')
  })

  it('keeps a locked accent byte-identical in the compiled roles', async () => {
    // The compiler lets locks win over every computed value, so a pack compiles
    // AROUND a locked token rather than being rejected. Assert the lock survives.
    const ctx = ioContext({
      app: 'demo',
      frontend: { design: { constraints: { locked_tokens: { '--inv-accent': '#e94560' } } } },
    })
    const result = await applyPack('corporate-trust', ctx)
    expect(result.type).toBe('success')

    const stored = (await ctx.storageBackend.loadTheme('u', 'a')) as {
      theme?: { roles?: Record<string, string> }
    }
    expect(stored.theme?.roles?.['--inv-accent']).toBe('#e94560')
  })

  it('rejects a disallowed pack even when called directly (UI filter is cosmetic; the gate is applyPack)', async () => {
    // retro-arcade is a dark pack; a light-only config must reject it.
    // This is the load-bearing regression: availablePacks hides the chip in the UI
    // but applyPack itself is the real enforcement gate — nothing should persist.
    const ctx = ioContext({
      app: 'demo',
      frontend: { design: { constraints: { allowed_modes: ['light'] } } },
    })
    const result = await applyPack('retro-arcade', ctx)
    expect(result.type).toBe('error')
    // Nothing must reach the store — the gate fired before persistAndApply.
    expect(ctx.themeStore.getTheme()).toBeNull()
    expect(await ctx.storageBackend.loadTheme('u', 'a')).toBeNull()
  })
})

describe('availablePacks', () => {
  it('returns every pack when no constraints are set', () => {
    const packs = availablePacks({ app: 'demo' })
    expect(packs).toHaveLength(THEME_PACKS.length)
    expect(packs.map((p) => p.id)).toEqual(THEME_PACKS.map((p) => p.id))
  })

  it('filters out packs whose mode is not in allowed_modes', () => {
    // light-only: every dark pack (retro-arcade, terminal-green, glass-dark,
    // sunset) must drop out; the light packs remain.
    const packs = availablePacks({
      app: 'demo',
      frontend: { design: { constraints: { allowed_modes: ['light'] } } },
    })
    const ids = packs.map((p) => p.id)
    expect(ids).not.toContain('retro-arcade')
    expect(ids).not.toContain('terminal-green')
    expect(ids).not.toContain('glass-dark')
    expect(ids).not.toContain('sunset')
    expect(ids).toContain('soft-pastel')
    expect(ids).toContain('corporate-trust')
    // Every survivor is a light-mode pack.
    for (const { id } of packs) {
      expect(THEME_PACKS.find((p) => p.id === id)!.spec.mode).toBe('light')
    }
  })

  it('filters out packs whose font pairing is outside a restricted registry', () => {
    // Allow only the corporate-clean pairing: corporate-trust survives, the rest
    // (different pairings) drop out.
    const packs = availablePacks({
      app: 'demo',
      frontend: { design: { constraints: { font_registry: ['corporate-clean'] } } },
    })
    expect(packs.map((p) => p.id)).toEqual(['corporate-trust'])
  })
})
