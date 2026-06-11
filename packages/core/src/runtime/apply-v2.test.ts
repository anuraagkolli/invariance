import { describe, it, expect, beforeEach } from 'vitest'
import { applyAnyTheme } from './apply'
import { isV2Theme } from '../config/types'
import type { ThemeJsonV2, ThemeJson } from '../config/types'

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
    applyAnyTheme(v2 as never, { app: 'x' })
    expect(setProps['--inv-surface-0']).toBe('#0f1117')
    expect(setProps['--inv-sidebar-bg']).toBe('var(--inv-surface-1)')
    expect(setProps['--inv-header-bg']).toBe('#123456')
  })

  it('isV2Theme discriminates', () => {
    expect(isV2Theme(v2 as never)).toBe(true)
    const v1: ThemeJson = { version: 1, base_app_version: 'v1' }
    expect(isV2Theme(v1)).toBe(false)
  })
})
