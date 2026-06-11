import { describe, it, expect, vi } from 'vitest'
import { converter, wcagContrast } from 'culori'
import { resolveSlotVar, buildSlotLiteral, solveDependentText, runSlotEdit } from './slot-edit'
import type { ThemeJsonV2 } from '../config/types'
import type { SlotRegistration } from '../context/registry'

const toOklch = converter('oklch')

const theme = (roles: Record<string, string>, slots: Record<string, string>): ThemeJsonV2 => ({
  version: 2, base_app_version: 'v1', theme: { roles, slots },
})

describe('resolveSlotVar', () => {
  it('returns an explicit literal as-is', () => {
    expect(resolveSlotVar('--inv-sidebar-bg', theme({}, { '--inv-sidebar-bg': '#123456' }))).toBe('#123456')
  })
  it('follows a var() reference into roles', () => {
    expect(resolveSlotVar('--inv-sidebar-bg', theme({ '--inv-surface-2': '#1f232c' }, { '--inv-sidebar-bg': 'var(--inv-surface-2)' }))).toBe('#1f232c')
  })
  it('falls back to the conventional default role when no slot entry exists', () => {
    expect(resolveSlotVar('--inv-sidebar-bg', theme({ '--inv-surface-1': '#171a21' }, {}))).toBe('#171a21')
    expect(resolveSlotVar('--inv-sidebar-text', theme({ '--inv-text-primary': '#f2f3f5' }, {}))).toBe('#f2f3f5')
    expect(resolveSlotVar('--inv-sidebar-border', theme({ '--inv-border': '#2a2f3a' }, {}))).toBe('#2a2f3a')
  })
  it('returns null on a fresh theme with no roles', () => {
    expect(resolveSlotVar('--inv-sidebar-bg', theme({}, {}))).toBeNull()
  })
})

describe('buildSlotLiteral', () => {
  it('keeps the current lightness when the move is "same"', () => {
    const current = '#1a1a2e'
    const out = buildSlotLiteral({ hue: 250, chromaLevel: 'medium', lightness: 'same', currentHex: current })
    const lOut = toOklch(out)?.l ?? 0
    const lIn = toOklch(current)?.l ?? 1
    expect(Math.abs(lOut - lIn)).toBeLessThan(0.02)
  })
  it('respects the developer chroma cap', () => {
    const out = buildSlotLiteral({ hue: 250, chromaLevel: 'vivid', lightness: 'same', currentHex: '#888888', chromaMax: 0.05 })
    expect(toOklch(out)?.c ?? 1).toBeLessThanOrEqual(0.051)
  })
  it('neutral chroma produces a gray', () => {
    const out = buildSlotLiteral({ hue: 250, chromaLevel: 'neutral', lightness: 'same', currentHex: '#3355aa' })
    expect(toOklch(out)?.c ?? 1).toBeLessThan(0.005)
  })
  it('clamps lightness moves to the displayable band', () => {
    const out = buildSlotLiteral({ hue: 250, chromaLevel: 'medium', lightness: 'much-lighter', currentHex: '#fefefe' })
    expect(toOklch(out)?.l ?? 2).toBeLessThanOrEqual(0.98)
    const out2 = buildSlotLiteral({ hue: 250, chromaLevel: 'medium', lightness: 'much-darker', currentHex: '#050505' })
    expect(toOklch(out2)?.l ?? 0).toBeGreaterThanOrEqual(0.07)
  })
  it('uses a mid lightness when nothing resolves (fresh theme)', () => {
    const out = buildSlotLiteral({ hue: 250, chromaLevel: 'medium', lightness: 'same', currentHex: null })
    const l = toOklch(out)?.l ?? 0
    expect(l).toBeGreaterThan(0.4)
    expect(l).toBeLessThan(0.7)
  })
})

describe('solveDependentText', () => {
  it('meets the contrast floor against a dark background', () => {
    const solved = solveDependentText('#1b2a4a', '#f2f3f5', 4.5)
    expect(solved.met).toBe(true)
    expect(wcagContrast(solved.hex, '#1b2a4a')).toBeGreaterThanOrEqual(4.5)
  })
  it('meets the contrast floor against a light background', () => {
    const solved = solveDependentText('#e8ecf4', '#0f1117', 4.5)
    expect(solved.met).toBe(true)
    expect(wcagContrast(solved.hex, '#e8ecf4')).toBeGreaterThanOrEqual(4.5)
  })
  it('falls back to near-neutral when the current text value is unparseable', () => {
    const solved = solveDependentText('#1b2a4a', null, 4.5)
    expect(solved.met).toBe(true)
  })
})

describe('varKindOf / compound suffixes', () => {
  it('classifies compound text tokens as text', () => {
    expect(resolveSlotVar('--inv-sidebar-text-secondary', theme({ '--inv-text-primary': '#f2f3f5' }, {}))).toBe('#f2f3f5')
  })
  it('classifies bg over later segments when both appear', () => {
    expect(resolveSlotVar('--inv-card-bg-hover', theme({ '--inv-surface-1': '#171a21' }, {}))).toBe('#171a21')
  })
})

describe('resolveSlotVar var() robustness', () => {
  it('resolves var() with a fallback clause', () => {
    expect(resolveSlotVar('--inv-sidebar-bg', theme({ '--inv-surface-2': '#1f232c' }, { '--inv-sidebar-bg': 'var(--inv-surface-2, #ffffff)' }))).toBe('#1f232c')
  })
  it('resolves var() with whitespace', () => {
    expect(resolveSlotVar('--inv-sidebar-bg', theme({ '--inv-surface-2': '#1f232c' }, { '--inv-sidebar-bg': 'var( --inv-surface-2 )' }))).toBe('#1f232c')
  })
})

const okReply = (body: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: 'text', text: JSON.stringify(body) }], stop_reason: 'end_turn' }),
  }) as unknown as Response

const sidebarReg: SlotRegistration = {
  name: 'sidebar', level: 1, pageName: '', preserve: false,
  alternativesCount: 0, type: 'slot', source: 'page',
  cssVariables: ['--inv-sidebar-bg', '--inv-sidebar-text'],
}

const baseInput = {
  intent: { slotName: 'sidebar', description: 'make the sidebar blue' },
  registry: [sidebarReg],
  config: { app: 'test' },
  constraints: { contrast: 4.5 },
  apiKey: 'k',
}

describe('runSlotEdit', () => {
  it('builds a contrast-solved bg+text micro-mutation', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okReply({
      targetVar: '--inv-sidebar-bg', hue: 250, chromaLevel: 'medium', lightness: 'same',
      explanation: 'Made the sidebar blue',
    }))
    // Current values come in as slot literals, NOT a partial roles map: a
    // non-empty-but-incomplete roles map would (correctly) fail
    // compilerOutputComplete in verifyV2. Real edits ride on either a complete
    // compiled theme or no roles at all.
    const currentV2 = theme({}, { '--inv-sidebar-bg': '#171a21', '--inv-sidebar-text': '#f2f3f5' })
    const outcome = await runSlotEdit({ ...baseInput, currentV2, fetchFn })
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      const slots = outcome.candidate.theme?.slots ?? {}
      const bg = slots['--inv-sidebar-bg']
      const text = slots['--inv-sidebar-text']
      expect(bg).toMatch(/^#[0-9a-f]{6}$/)
      expect(text).toMatch(/^#[0-9a-f]{6}$/)
      expect(wcagContrast(text!, bg!)).toBeGreaterThanOrEqual(4.5)
      expect(outcome.explanation).toBe('Made the sidebar blue')
    }
  })

  it('rejects a slot with no registered css variables before calling the model', async () => {
    const fetchFn = vi.fn()
    const bare: SlotRegistration = { ...sidebarReg, name: 'bare' }
    delete (bare as Record<string, unknown>).cssVariables
    const outcome = await runSlotEdit({
      ...baseInput, intent: { slotName: 'bare', description: 'make it blue' },
      registry: [bare], currentV2: theme({}, {}), fetchFn,
    })
    expect(outcome.ok).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('refuses to shadow a developer lock with a slot literal', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okReply({
      targetVar: '--inv-sidebar-bg', hue: 250, chromaLevel: 'medium', lightness: 'same',
      explanation: 'Made the sidebar blue',
    }))
    const outcome = await runSlotEdit({
      ...baseInput,
      constraints: { contrast: 4.5, locked_tokens: { '--inv-sidebar-bg': '#101010' } },
      currentV2: theme({}, {}), fetchFn,
    })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toContain('locked')
  })

  it('adjusts a requested text color that cannot read against the current bg', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okReply({
      targetVar: '--inv-sidebar-text', hue: 250, chromaLevel: 'medium', lightness: 'much-darker',
      explanation: 'Made the sidebar text navy',
    }))
    const currentV2 = theme({}, { '--inv-sidebar-bg': '#0f1117' })
    const outcome = await runSlotEdit({ ...baseInput, currentV2, fetchFn })
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      const text = outcome.candidate.theme?.slots?.['--inv-sidebar-text']
      expect(wcagContrast(text!, '#0f1117')).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('errors politely on an unparseable model reply', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okReply('not-a-pick'))
    const outcome = await runSlotEdit({ ...baseInput, currentV2: theme({}, {}), fetchFn })
    expect(outcome.ok).toBe(false)
  })
})
