import { describe, it, expect } from 'vitest'
import { ThemeJsonV2Schema, THEME_PACKS } from 'invariance/headless'
import { isValidV2Theme } from './validate'

// A complete, schema-valid StyleSpec (a real pack) — the only kind the snippet ever
// round-trips, since it stores a spec it just produced via compileTheme.
const VALID_SPEC = THEME_PACKS[0]!.spec

// The snippet's hand-rolled gate must agree with the SDK's zod schema on every
// case the snippet round-trips — that agreement is the whole reason it's safe to
// swap the zod parse out of the bundle. Each case asserts isValidV2Theme matches
// ThemeJsonV2Schema.safeParse().success.
describe('isValidV2Theme', () => {
  const cases: Array<{ name: string; value: unknown }> = [
    { name: 'minimal valid v2 (no theme)', value: { version: 2, base_app_version: 'trial' } },
    {
      name: 'roles + slots of safe values',
      value: {
        version: 2,
        base_app_version: 'x',
        theme: { roles: { '--inv-accent': '#E94560' }, slots: { '--inv-sidebar-bg': 'var(--inv-surface-1)' } },
      },
    },
    {
      name: 'styleSpec provenance carried (a real, complete spec)',
      value: {
        version: 2,
        base_app_version: 'trial',
        theme: { roles: { '--inv-accent': '#000000' }, slots: {}, styleSpec: VALID_SPEC },
      },
    },
    { name: 'wrong version', value: { version: 1, base_app_version: 'x' } },
    { name: 'missing base_app_version', value: { version: 2 } },
    { name: 'non-object', value: 'nope' },
    { name: 'null', value: null },
    {
      name: 'injection-shaped role value',
      value: { version: 2, base_app_version: 'x', theme: { roles: { '--inv-accent': 'red;background-image:url(//evil)' } } },
    },
    {
      // A </style> breakout followed by a script tag is the canonical style-block
      // escape. The forbidden-chars check (< and >) in isSafeCssTokenValue must
      // catch it; this case locks in that guarantee.
      name: '</style> breakout payload in slot value',
      value: {
        version: 2,
        base_app_version: 'x',
        theme: { slots: { '--inv-sidebar-bg': '</style><script>alert(1)</script>' } },
      },
    },
    {
      name: 'non --inv-* role key',
      value: { version: 2, base_app_version: 'x', theme: { roles: { color: '#000000' } } },
    },
    {
      name: 'role value that is not a string',
      value: { version: 2, base_app_version: 'x', theme: { roles: { '--inv-accent': 123 } } },
    },
  ]

  for (const { name, value } of cases) {
    it(`agrees with ThemeJsonV2Schema: ${name}`, () => {
      const zodOk = ThemeJsonV2Schema.safeParse(value).success
      expect(isValidV2Theme(value)).toBe(zodOk)
    })
  }

  // DELIBERATE divergence: the lightweight gate treats styleSpec as opaque (object
  // present = ok) and does NOT field-validate it. The SDK schema does. This is safe
  // because (a) styleSpec carries no CSS sink, and (b) the round-trip re-runs the
  // full SDK schema on load. Documented so the difference is intentional.
  it('accepts a structurally-present but field-incomplete styleSpec (zod would reject)', () => {
    const value = { version: 2, base_app_version: 'x', theme: { styleSpec: { mode: 'dark' } } }
    expect(ThemeJsonV2Schema.safeParse(value).success).toBe(false)
    expect(isValidV2Theme(value)).toBe(true)
  })
})
