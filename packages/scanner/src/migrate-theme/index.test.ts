import { describe, it, expect } from 'vitest'
import { ThemeJsonV2Schema } from 'invariance'

import { migrateTheme } from './index'

describe('migrateTheme — version carry-forward', () => {
  it('carries known roles, drops unknown tokens, and renames via the map', () => {
    // A v1 stored theme: globals carry both --inv-* tokens AND structured
    // groups. upgradeThemeJson partitions these into v2 slots.
    const storedV1 = {
      version: 1,
      base_app_version: 'v1',
      theme: {
        globals: {
          '--inv-accent': '#e94560', // a role token — should carry
          '--inv-sidebar-bg': '#1a1a2e', // a slot token still known — carry
          '--inv-legacy-thing': '#123456', // not in any registry — drop
          '--inv-old-name': '#abcdef', // renamed below
        },
      },
    }

    const report = migrateTheme(
      storedV1,
      {
        roles: ['--inv-accent'],
        slots: ['--inv-sidebar-bg', '--inv-new-name'],
      },
      { '--inv-old-name': '--inv-new-name' },
    )

    // accent carried into roles.
    expect(report.carried).toContain('--inv-accent')
    expect(report.theme.theme?.roles?.['--inv-accent']).toBe('#e94560')

    // sidebar-bg carried into slots.
    expect(report.carried).toContain('--inv-sidebar-bg')
    expect(report.theme.theme?.slots?.['--inv-sidebar-bg']).toBe('#1a1a2e')

    // legacy-thing dropped (not in either registry).
    expect(report.dropped).toContain('--inv-legacy-thing')
    expect(report.theme.theme?.slots?.['--inv-legacy-thing']).toBeUndefined()
    expect(report.theme.theme?.roles?.['--inv-legacy-thing']).toBeUndefined()

    // old-name renamed to new-name, value preserved, lands in slots (its new
    // key is a slot in the registry).
    expect(report.renamed).toContainEqual({ from: '--inv-old-name', to: '--inv-new-name' })
    expect(report.theme.theme?.slots?.['--inv-new-name']).toBe('#abcdef')
    expect(report.theme.theme?.slots?.['--inv-old-name']).toBeUndefined()

    // Output validates against the canonical v2 schema.
    const parsed = ThemeJsonV2Schema.safeParse(report.theme)
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true)
    expect(report.theme.version).toBe(2)
  })

  it('passes a v2 theme through, dropping slot tokens absent from the registry', () => {
    const storedV2 = {
      version: 2 as const,
      base_app_version: 'v2',
      theme: {
        roles: { '--inv-accent': '#ff0000' },
        slots: {
          '--inv-sidebar-bg': '#222222',
          '--inv-removed-slot': '#333333',
        },
      },
    }

    const report = migrateTheme(storedV2, {
      roles: ['--inv-accent'],
      slots: ['--inv-sidebar-bg'],
    })

    expect(report.carried).toEqual(expect.arrayContaining(['--inv-accent', '--inv-sidebar-bg']))
    expect(report.dropped).toContain('--inv-removed-slot')
    expect(report.theme.theme?.slots?.['--inv-removed-slot']).toBeUndefined()
    expect(report.theme.theme?.slots?.['--inv-sidebar-bg']).toBe('#222222')

    const parsed = ThemeJsonV2Schema.safeParse(report.theme)
    expect(parsed.success).toBe(true)
  })

  it('defaults the role registry to ROLE_TOKENS when roles are omitted', () => {
    const storedV2 = {
      version: 2 as const,
      base_app_version: 'v2',
      theme: { roles: { '--inv-accent': '#ff0000', '--inv-surface-0': '#ffffff' } },
    }
    // No `roles` supplied -> ROLE_TOKENS used; both accent + surface-0 are roles.
    const report = migrateTheme(storedV2, { slots: [] })
    expect(report.carried).toEqual(expect.arrayContaining(['--inv-accent', '--inv-surface-0']))
    expect(report.dropped).toEqual([])
  })

  it('passes content/layout/components sections through untouched', () => {
    const storedV2 = {
      version: 2 as const,
      base_app_version: 'v2',
      theme: { roles: { '--inv-accent': '#ff0000' } },
      content: { pages: { '/': { hero: { text: 'Hello' } } } },
    }
    const report = migrateTheme(storedV2, { roles: ['--inv-accent'], slots: [] })
    expect(report.theme.content).toEqual(storedV2.content)
  })
})
