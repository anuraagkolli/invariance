// packages/theming/test/verify/css-safe.test.ts
import { describe, it, expect } from 'vitest';
import { isSafeCssTokenValue, _positiveParseOnly } from '../../src/verify/css-safe.js';

// ---------------------------------------------------------------------------
// ACCEPT — real compiler emits (all must return true)
// ---------------------------------------------------------------------------
describe('isSafeCssTokenValue — ACCEPT (real compiler emits)', () => {
  it('shape:number — plain finite numbers', () => {
    expect(isSafeCssTokenValue('8')).toBe(true);
    expect(isSafeCssTokenValue('0.5')).toBe(true);
    expect(isSafeCssTokenValue('-2')).toBe(true);
    expect(isSafeCssTokenValue('1.25')).toBe(true);
  });

  it('shape:triple — numeric channel triples (bare hsl/rgb/oklch components)', () => {
    expect(isSafeCssTokenValue('0 0% 100%')).toBe(true);
    expect(isSafeCssTokenValue('240 5.9% 10%')).toBe(true);
    expect(isSafeCssTokenValue('0 72.2% 50.6%')).toBe(true);
    expect(isSafeCssTokenValue('0 0 0')).toBe(true); // rgb triple
  });

  it('shape:function — culori-parseable color function forms', () => {
    expect(isSafeCssTokenValue('oklch(0.62 0.19 29)')).toBe(true);
    expect(isSafeCssTokenValue('hsl(0 0% 100%)')).toBe(true);
  });

  it('shape:hex — culori-parseable hex colors', () => {
    expect(isSafeCssTokenValue('#ffffff')).toBe(true);
    expect(isSafeCssTokenValue('#fff')).toBe(true);
  });

  it('shape:raw font-stack — comma-separated font identifiers and quoted strings', () => {
    expect(isSafeCssTokenValue("ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif")).toBe(true);
    expect(isSafeCssTokenValue('ui-sans-serif, system-ui, sans-serif')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// REJECT — injection attempts and malformed values (all must return false)
// ---------------------------------------------------------------------------
describe('isSafeCssTokenValue — REJECT (injection / breakout attempts)', () => {
  it('THE critical bug fix: expression(alert(1)) is now REJECTED', () => {
    // This was the motivating bypass: expression() is not a number, not a triple,
    // not a culori color, and not a clean font-stack (contains parens) → structurally rejected.
    expect(isSafeCssTokenValue('expression(alert(1))')).toBe(false);
  });

  it('rejects CSS injection via semicolon + rule injection', () => {
    expect(isSafeCssTokenValue('red; } body { display:none')).toBe(false);
  });

  it('rejects semicolon+rule appended to a color', () => {
    expect(isSafeCssTokenValue('#fff; color:red')).toBe(false);
  });

  it('rejects url() exfiltration', () => {
    expect(isSafeCssTokenValue('url(https://evil)')).toBe(false);
  });

  it('rejects </style> breakout via angle brackets', () => {
    expect(isSafeCssTokenValue('</style><script>')).toBe(false);
  });

  it('rejects CSS comment injection', () => {
    expect(isSafeCssTokenValue('/* */ red')).toBe(false);
  });

  it('rejects at-rule injection', () => {
    expect(isSafeCssTokenValue("@import 'x'")).toBe(false);
  });

  it('rejects closing brace (escapes rule block)', () => {
    expect(isSafeCssTokenValue('100%}')).toBe(false);
  });

  it('rejects backslash escape sequences', () => {
    expect(isSafeCssTokenValue('red\\3c')).toBe(false);
  });

  it('rejects empty and whitespace-only values', () => {
    expect(isSafeCssTokenValue('')).toBe(false);
    expect(isSafeCssTokenValue('   ')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Regression: positive parse alone is sufficient (fast-reject is not the real guard)
// ---------------------------------------------------------------------------
describe('_positiveParseOnly — regression: positive parse alone rejects breakouts', () => {
  it('rejects expression(alert(1)) via positive parse, without fast-reject', () => {
    // expression() contains parens → not a plain number, not a numeric triple,
    // not a culori color, and not a clean font-stack (contains parens) → structurally rejected.
    expect(_positiveParseOnly('expression(alert(1))')).toBe(false);
  });

  it('rejects url(https://evil) via positive parse', () => {
    expect(_positiveParseOnly('url(https://evil)')).toBe(false);
  });

  it('still accepts all compiler-emitted forms via positive parse', () => {
    expect(_positiveParseOnly('8')).toBe(true);
    expect(_positiveParseOnly('0 0% 100%')).toBe(true);
    expect(_positiveParseOnly('#ffffff')).toBe(true);
    expect(_positiveParseOnly('oklch(0.62 0.19 29)')).toBe(true);
    expect(_positiveParseOnly('hsl(0 0% 100%)')).toBe(true);
    expect(_positiveParseOnly("ui-sans-serif, system-ui, 'Segoe UI', sans-serif")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Control-char precondition: _positiveParseOnly alone MUST reject internal control chars.
// culori tolerates them (rgb(0\n0\n0) parses successfully), so without this precondition
// the claim "positive parse alone is the guard" would be false.
// ---------------------------------------------------------------------------
describe('_positiveParseOnly — control-char precondition (closes culori internal-whitespace gap)', () => {
  it('rejects rgb() with internal newline via positive parse alone', () => {
    // culori.parse("rgb(0\n0\n0)") returns a color — so the culori check would pass.
    // The control-char precondition in _positiveParseOnly must catch this BEFORE culori.
    expect(_positiveParseOnly('rgb(0\n0\n0)')).toBe(false);
  });

  it('rejects hsl() with internal newline via positive parse alone', () => {
    expect(_positiveParseOnly('hsl(0\n0%\n100%)')).toBe(false);
  });

  it('rejects rgb() with leading newline via positive parse alone', () => {
    expect(_positiveParseOnly('rgb(\n0 0 0)')).toBe(false);
  });

  it('rejects rgb() with internal tab via positive parse alone', () => {
    expect(_positiveParseOnly('rgb(0\t0\t0)')).toBe(false);
  });

  it('isSafeCssTokenValue also rejects control-char-bearing colors (belt+suspenders)', () => {
    expect(isSafeCssTokenValue('rgb(0\n0\n0)')).toBe(false);
    expect(isSafeCssTokenValue('hsl(0\n0%\n100%)')).toBe(false);
    expect(isSafeCssTokenValue('rgb(\n0 0 0)')).toBe(false);
    expect(isSafeCssTokenValue('rgb(0\t0\t0)')).toBe(false);
  });

  it('does NOT false-reject valid shorthand/named colors (no false-reject)', () => {
    // These are compiler-emitted valid colors — must still be accepted.
    expect(_positiveParseOnly('#fff')).toBe(true);
    expect(_positiveParseOnly('red')).toBe(true);
    expect(_positiveParseOnly('#ffffff')).toBe(true);
    expect(_positiveParseOnly('oklch(0.62 0.19 29)')).toBe(true);
    expect(_positiveParseOnly('hsl(0 0% 100%)')).toBe(true);
    expect(_positiveParseOnly('rgb(255 255 255)')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Legacy accept cases that must still pass (backward compat for other callers)
// ---------------------------------------------------------------------------
describe('isSafeCssTokenValue — legacy accept cases', () => {
  it('accepts rgb() function form', () => {
    // rgb(255 255 255) is culori-parseable
    expect(isSafeCssTokenValue('rgb(255 255 255)')).toBe(true);
  });

  it('accepts oklch with decimal hue', () => {
    expect(isSafeCssTokenValue('oklch(0.62 0.19 29.2)')).toBe(true);
  });
});
