import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AnyThemeJson, ThemeJsonV2 } from '../config/types'
import { canonicalStringify } from '../utils/canonical-json'
import { themeFromCookieHeader } from '../runtime/ssr'
import { mirrorThemeCookie } from './cookie-mirror'

const config = { app: 'nebula-demo' }

// Tests run in node (no jsdom). A minimal cookie jar emulates document.cookie's
// accumulating setter / serialized getter so we can assert what was written.
// Note: this stub ignores max-age=0 expiry — fine, each test installs a fresh jar.
function installCookieJar(): { current: () => string } {
  const jar = new Map<string, string>()
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      set cookie(str: string) {
        const pair = str.split(';')[0] ?? ''
        const eq = pair.indexOf('=')
        if (eq === -1) return
        jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
      },
      get cookie(): string {
        return Array.from(jar.entries())
          .map(([k, v]) => `${k}=${v}`)
          .join('; ')
      },
    },
  })
  return { current: () => (globalThis as { document: { cookie: string } }).document.cookie }
}

const slotsOnly: ThemeJsonV2 = {
  version: 2,
  base_app_version: 'v1',
  theme: { roles: {}, slots: { '--inv-accent': '#00ff88' } },
}

describe('mirrorThemeCookie', () => {
  let jar: { current: () => string }
  beforeEach(() => {
    jar = installCookieJar()
  })
  afterEach(() => {
    delete (globalThis as { document?: unknown }).document
    vi.restoreAllMocks()
  })

  it('writes a cookie that round-trips through themeFromCookieHeader', () => {
    mirrorThemeCookie(config.app, slotsOnly)
    const parsed = themeFromCookieHeader(jar.current(), config)
    expect(parsed).toEqual(slotsOnly)
  })

  it('canonically stringifies (stable key order)', () => {
    mirrorThemeCookie(config.app, slotsOnly)
    const expected = encodeURIComponent(canonicalStringify(slotsOnly))
    expect(jar.current()).toContain(`invariance-theme-${config.app}=${expected}`)
  })

  it('skips the mirror with a warn when the encoded doc exceeds the size budget', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const slots: Record<string, string> = {}
    for (let i = 0; i < 500; i++) slots[`--inv-token-${i}`] = '#abcdef'
    const big = { version: 2, base_app_version: 'v1', theme: { slots } } as unknown as AnyThemeJson

    mirrorThemeCookie(config.app, big)
    expect(warn).toHaveBeenCalledOnce()
    expect(jar.current()).not.toContain(`invariance-theme-${config.app}=`)
  })

  it('no-ops without throwing when document is undefined (SSR)', () => {
    delete (globalThis as { document?: unknown }).document
    expect(() => mirrorThemeCookie(config.app, slotsOnly)).not.toThrow()
  })
})
