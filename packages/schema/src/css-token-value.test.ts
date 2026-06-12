import { describe, it, expect } from 'vitest'

import { isSafeCssTokenValue, CssTokenValueSchema } from './css-token-value'

// The grammar's job: accept 100% of legitimate compiler/scanner/demo token
// values, reject anything that could inject a sibling declaration, close the
// style tag, or fetch a network resource. These tables are the contract.

const PASS_HEX = [
  '#fff',
  '#ffff',
  '#000000',
  '#e94560',
  '#1A1A2E', // scanner emits uppercase hex
  '#0a0b0d',
  '#ff8194ff', // 8-digit (alpha)
]

const PASS_FONT_STACKS = [
  "'Space Grotesk', system-ui, sans-serif",
  "'Inter', system-ui, sans-serif",
  "'JetBrains Mono', ui-monospace, 'SF Mono', monospace", // space inside quotes
  "'JetBrains Mono', ui-monospace, monospace",
  "'Source Serif 4', Georgia, serif", // digit inside a quoted family
  "'Baloo 2', system-ui, sans-serif",
  "'Playfair Display', Georgia, serif",
  "'VT323', monospace",
  "'IBM Plex Mono', ui-monospace, monospace",
  "'Archivo Black', system-ui, sans-serif",
  'monospace',
  'system-ui',
  '"Helvetica Neue", Arial, sans-serif', // double-quoted family
]

const PASS_NUMERIC = ['0px', '4px', '8px', '12px', '20px', '999px', '1px', '3px', '5px', '0', '1.5rem', '100%', '0.5', '45deg', '200ms', '1fr']

const PASS_COLOR_FN = [
  'rgb(0 0 0 / 0.13)',
  'rgba(255, 255, 255, 0.5)',
  'hsl(210 50% 40%)',
  'hsla(210, 50%, 40%, 0.5)',
  'oklch(0.7 0.15 250)',
  'oklab(0.7 -0.1 0.1)',
]

const PASS_VAR = [
  'var(--inv-surface-1)',
  'var(--inv-text-primary)',
  'var(--inv-sidebar-bg)',
  'var(--inv-accent, #e94560)', // fallback to hex
  'var(--inv-accent, var(--inv-surface-0))', // fallback to another var
]

const PASS_SHADOW = [
  'none',
  '0 1px 2px rgb(0 0 0 / 0.08)',
  '0 4px 12px rgb(0 0 0 / 0.10)',
  '0 2px 8px rgb(0 0 0 / 0.24)',
  '0 12px 32px rgb(0 0 0 / 0.35)',
  '4px 4px 0 #000000', // hard-offset, hex color
  '6px 6px 0 #000000',
  'inset 0 1px 2px rgb(0 0 0 / 0.2)', // inset keyword
]

// The injection corpus: every one MUST fail. These are the actual attack the
// fix closes (sibling declaration via ';', tag escape via '<'/'}', url() beacon).
const FAIL_INJECTION = [
  'red;background-image:url(//evil/beacon)',
  'red;background:url(//evil)',
  '</style><script>alert(1)</script>',
  'a}b{color:red',
  'red}body{display:none',
  '\\3c script',
  'url(//x)',
  'url("//evil/beacon.png")',
  "expression(alert('xss'))",
  '#fff;', // trailing semicolon
  '#fff }', // brace
  'rgb(0 0 0); x:y', // semicolon after a legit-looking start
  'var(--inv-x); background:url(//e)', // var with injected sibling
  "'Inter'; background-image: url(//e)", // font stack with injection
  'rgb(0 0 0 / url(//e))', // url smuggled inside color fn parens
  'red\u0000x', // null byte (control char)
  'red\tx', // tab (control char)
  'red\nbackground:url(//e)', // newline
  '#fff\\', // backslash
  '<svg>',
  'attr(data-x)', // unknown function
  'calc(1px + url(//e))', // calc with url
  '', // empty (min length)
  '   ', // whitespace only
]

describe('isSafeCssTokenValue', () => {
  it('accepts every hex color form', () => {
    for (const v of PASS_HEX) expect(isSafeCssTokenValue(v), v).toBe(true)
  })

  it('accepts every legitimate font stack', () => {
    for (const v of PASS_FONT_STACKS) expect(isSafeCssTokenValue(v), v).toBe(true)
  })

  it('accepts numeric + unit values', () => {
    for (const v of PASS_NUMERIC) expect(isSafeCssTokenValue(v), v).toBe(true)
  })

  it('accepts the allowed color functions', () => {
    for (const v of PASS_COLOR_FN) expect(isSafeCssTokenValue(v), v).toBe(true)
  })

  it('accepts var() references with simple fallbacks', () => {
    for (const v of PASS_VAR) expect(isSafeCssTokenValue(v), v).toBe(true)
  })

  it('accepts shadow composites the compiler emits', () => {
    for (const v of PASS_SHADOW) expect(isSafeCssTokenValue(v), v).toBe(true)
  })

  it('rejects every injection payload', () => {
    for (const v of FAIL_INJECTION) expect(isSafeCssTokenValue(v), v).toBe(false)
  })

  it('never accepts a value containing a forbidden character', () => {
    // The unifying rule, asserted independently of the grammar alternatives.
    for (const ch of [';', '\\', '<', '}', '{', '>']) {
      expect(isSafeCssTokenValue(`#fff${ch}`), `#fff${ch}`).toBe(false)
    }
  })
})

describe('CssTokenValueSchema (zod)', () => {
  it('parses a legitimate value', () => {
    expect(CssTokenValueSchema.safeParse('#e94560').success).toBe(true)
    expect(CssTokenValueSchema.safeParse('var(--inv-surface-1)').success).toBe(true)
  })

  it('rejects an injection value', () => {
    expect(CssTokenValueSchema.safeParse('red;background:url(//e)').success).toBe(false)
  })
})
