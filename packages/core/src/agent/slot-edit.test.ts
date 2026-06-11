import { describe, it, expect } from 'vitest'
import { converter, wcagContrast } from 'culori'
import { resolveSlotVar, buildSlotLiteral, solveDependentText } from './slot-edit'
import type { ThemeJsonV2 } from '../config/types'

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
