import { describe, it, expect } from 'vitest'
import { compileTheme } from '../compiler/compile'
import { THEME_PACKS } from '../registries/theme-packs'
import { verifyV2 } from './compiled-tests'
import type { ThemeJsonV2 } from '../config/types'

const pack = THEME_PACKS.find((p) => p.id === 'corporate-trust')!
const compiled = compileTheme(pack.spec)
const goodTheme: ThemeJsonV2 = {
  version: 2, base_app_version: 'v1',
  theme: { roles: compiled.roles, slots: { '--inv-sidebar-bg': 'var(--inv-surface-1)' }, styleSpec: pack.spec },
}
const config = { app: 'demo' }

describe('verifyV2', () => {
  it('passes a freshly compiled theme', () => {
    const r = verifyV2(goodTheme, config, {})
    expect(r.passed, JSON.stringify(r.results.filter((t) => !t.passed))).toBe(true)
  })

  it('styleSpecValid fails on a corrupted spec', () => {
    const bad = { ...goodTheme, theme: { ...goodTheme.theme, styleSpec: { mode: 'neon' } as never } }
    const r = verifyV2(bad, config, {})
    expect(r.results.find((t) => t.name === 'styleSpecValid')?.passed).toBe(false)
  })

  it('compilerOutputComplete fails when a role is missing', () => {
    const roles = { ...compiled.roles }
    delete roles['--inv-ring']
    const r = verifyV2({ ...goodTheme, theme: { ...goodTheme.theme, roles } }, config, {})
    expect(r.results.find((t) => t.name === 'compilerOutputComplete')?.passed).toBe(false)
  })

  it('lockedTokensUntouched fails when a locked token was changed', () => {
    const r = verifyV2(goodTheme, config, { locked_tokens: { '--inv-accent': '#123456' } })
    expect(r.results.find((t) => t.name === 'lockedTokensUntouched')?.passed).toBe(false)
  })

  it('contrastPairs catches a hand-corrupted role map', () => {
    const roles = { ...compiled.roles, '--inv-text-primary': compiled.roles['--inv-surface-1'] }
    const r = verifyV2({ ...goodTheme, theme: { ...goodTheme.theme, roles } }, config, {})
    expect(r.results.find((t) => t.name === 'contrastPairs')?.passed).toBe(false)
  })

  it('fontInRegistry fails on a family outside the registry', () => {
    const roles = { ...compiled.roles, '--inv-font-display': "'Comic Sans MS', cursive" }
    const r = verifyV2({ ...goodTheme, theme: { ...goodTheme.theme, roles } }, config, {})
    expect(r.results.find((t) => t.name === 'fontInRegistry')?.passed).toBe(false)
  })

  it('varRefsResolve fails on a dangling var() reference', () => {
    const slots = { '--inv-header-bg': 'var(--inv-does-not-exist)' }
    const r = verifyV2({ ...goodTheme, theme: { ...goodTheme.theme, slots } }, config, {})
    expect(r.results.find((t) => t.name === 'varRefsResolve')?.passed).toBe(false)
  })
})
