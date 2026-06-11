import { describe, it, expect, beforeEach } from 'vitest'
import { applyAnyTheme } from './apply'
import { isV2Theme } from '../config/types'
import type { ThemeJsonV2, ThemeJson, AnyThemeJson } from '../config/types'

// minimal documentElement stub — avoids a jsdom dependency
const setProps: Record<string, string> = {}
beforeEach(() => {
  for (const k of Object.keys(setProps)) delete setProps[k]
  ;(globalThis as { document?: unknown }).document = {
    documentElement: { style: { setProperty: (k: string, v: string) => { setProps[k] = v } } },
  }
})

const v2: ThemeJsonV2 = {
  version: 2, base_app_version: 'v1',
  theme: {
    roles: { '--inv-surface-0': '#0f1117', '--inv-font-display': "'VT323', monospace" },
    slots: { '--inv-sidebar-bg': 'var(--inv-surface-1)', '--inv-header-bg': '#123456' },
  },
}

describe('applyAnyTheme (v2)', () => {
  it('writes roles then slots verbatim to :root, var() refs included', () => {
    // ThemeJsonV2 satisfies AnyThemeJson — no cast needed
    applyAnyTheme(v2 as AnyThemeJson, { app: 'x' })
    expect(setProps['--inv-surface-0']).toBe('#0f1117')
    expect(setProps['--inv-sidebar-bg']).toBe('var(--inv-surface-1)')
    expect(setProps['--inv-header-bg']).toBe('#123456')
  })

  it('isV2Theme discriminates', () => {
    // ThemeJsonV2 is a member of the ThemeJson | ThemeJsonV2 union — no cast needed
    expect(isV2Theme(v2)).toBe(true)
    const v1: ThemeJson = { version: 1, base_app_version: 'v1' }
    expect(isV2Theme(v1)).toBe(false)
  })

  it('legacy v5 revision counters do not misclassify as v2', () => {
    // v5 incremented `version` as a per-save counter; a doc at version 3
    // with a globals key must NOT be treated as v2.
    const legacy: ThemeJson = {
      version: 3,
      base_app_version: 'v1',
      theme: { globals: { '--inv-x': '#fff' } },
    }
    expect(isV2Theme(legacy)).toBe(false)
  })
})
