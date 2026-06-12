import { describe, it, expect, vi } from 'vitest'
import { ThemeJsonV2Schema, prepareStoredTheme } from 'invariance/headless'
import type { RoleAssignment, StyleSpec } from 'invariance/headless'
import { buildExportTheme, downloadTheme } from './export'

function assignment(roles: Record<string, string>): RoleAssignment {
  return { roles, varToRole: new Map(), warnings: [] }
}

const spec: StyleSpec = {
  mode: 'dark',
  accentHue: 345,
  accentChroma: 'vivid',
  neutralTint: 260,
  neutralTintStrength: 'subtle',
  contrast: 'standard',
  fontPairing: 'inter-inter',
  radius: 'rounded',
  shadow: 'subtle',
  density: 'standard',
  borderWeight: 'standard',
  rationale: 'retro test fixture',
}

describe('buildExportTheme', () => {
  it('produces a schema-valid v2 doc with the seeded roles and trial provenance', () => {
    const theme = buildExportTheme(assignment({ '--inv-accent': '#E94560' }))
    expect(theme.version).toBe(2)
    expect(theme.base_app_version).toBe('trial')
    expect(theme.theme?.roles).toEqual({ '--inv-accent': '#E94560' })
    expect(theme.theme?.slots).toEqual({})
    expect(ThemeJsonV2Schema.safeParse(theme).success).toBe(true)
  })

  it('includes styleSpec provenance only when given one', () => {
    const without = buildExportTheme(assignment({ '--inv-accent': '#E94560' }))
    expect(without.theme && 'styleSpec' in without.theme).toBe(false)
    const withSpec = buildExportTheme(assignment({ '--inv-accent': '#E94560' }), spec)
    expect(withSpec.theme?.styleSpec).toEqual(spec)
  })

  it('throws on an assignment that would build an invalid v2 doc', () => {
    // An injection-shaped role value fails CssTokenValueSchema inside the schema.
    expect(() => buildExportTheme(assignment({ '--inv-accent': 'red;evil:1' }))).toThrow()
  })

  it('round-trips through prepareStoredTheme (the SDK load gate) as ok', () => {
    // The bridge contract: a trial-exported theme survives the same upgrade+verify
    // the SDK runs on load. A partial seed (no styleSpec) passes by design.
    const theme = buildExportTheme(assignment({ '--inv-accent': '#E94560', '--inv-surface-0': '#FFFFFF' }))
    const prepared = prepareStoredTheme(theme, { app: 'trial' })
    expect(prepared.ok).toBe(true)
  })
})

describe('downloadTheme', () => {
  it('is a no-op outside a document (SSR / node guard) without throwing', () => {
    const theme = buildExportTheme(assignment({ '--inv-accent': '#E94560' }))
    const realDoc = globalThis.document
    // @ts-expect-error — simulate a documentless environment.
    delete globalThis.document
    expect(() => downloadTheme(theme)).not.toThrow()
    globalThis.document = realDoc
  })

  it('creates an anchor and clicks it to trigger the download', () => {
    const theme = buildExportTheme(assignment({ '--inv-accent': '#E94560' }))
    const click = vi.fn()
    const anchor = document.createElement('a')
    anchor.click = click
    const createSpy = vi.spyOn(document, 'createElement').mockReturnValue(anchor)
    // jsdom has no URL.createObjectURL; stub it so the path runs.
    const createURL = vi.fn(() => 'blob:mock')
    const revokeURL = vi.fn()
    // @ts-expect-error — assign onto the jsdom URL.
    URL.createObjectURL = createURL
    // @ts-expect-error — assign onto the jsdom URL.
    URL.revokeObjectURL = revokeURL

    downloadTheme(theme, 'my-theme.json')

    expect(anchor.download).toBe('my-theme.json')
    expect(click).toHaveBeenCalledTimes(1)
    expect(createURL).toHaveBeenCalledTimes(1)
    createSpy.mockRestore()
  })
})
