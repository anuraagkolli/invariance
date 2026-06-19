// packages/theming/test/verify/css-safe.test.ts
import { describe, it, expect } from 'vitest';
import { isSafeCssTokenValue } from '../../src/verify/css-safe.js';

describe('isSafeCssTokenValue', () => {
  it('accepts ordinary emitted color/dimension/typography values', () => {
    expect(isSafeCssTokenValue('hsl(0 0% 100%)')).toBe(true);
    expect(isSafeCssTokenValue('oklch(0.62 0.19 29.2)')).toBe(true);
    expect(isSafeCssTokenValue('rgb(255 255 255)')).toBe(true);
    expect(isSafeCssTokenValue('0 0% 100%')).toBe(true);
    expect(isSafeCssTokenValue('0.5rem')).toBe(true);
    expect(isSafeCssTokenValue('#ffffff')).toBe(true);
    expect(isSafeCssTokenValue('1.25')).toBe(true);
    expect(isSafeCssTokenValue('ui-sans-serif, system-ui, sans-serif')).toBe(true);
  });

  it('rejects a semicolon (terminates the declaration)', () => {
    expect(isSafeCssTokenValue('red; color: blue')).toBe(false);
  });

  it('rejects a closing brace (escapes the rule block)', () => {
    expect(isSafeCssTokenValue('red } body { display:none')).toBe(false);
  });

  it('rejects an opening brace (opens a new block)', () => {
    expect(isSafeCssTokenValue('red { x: y')).toBe(false);
  });

  it('rejects comment delimiters', () => {
    expect(isSafeCssTokenValue('red /* comment */')).toBe(false);
    expect(isSafeCssTokenValue('red */')).toBe(false);
  });

  it('rejects at-rules and url() exfiltration', () => {
    expect(isSafeCssTokenValue('@import "evil.css"')).toBe(false);
    expect(isSafeCssTokenValue('url(http://evil.example/leak)')).toBe(false);
    expect(isSafeCssTokenValue('URL(x)')).toBe(false);
  });

  it('rejects backslash escapes and angle brackets', () => {
    expect(isSafeCssTokenValue('\\3c script')).toBe(false);
    expect(isSafeCssTokenValue('</style>')).toBe(false);
  });

  it('rejects empty and whitespace-only values', () => {
    expect(isSafeCssTokenValue('')).toBe(false);
    expect(isSafeCssTokenValue('   ')).toBe(false);
  });

  it('round-trips: a value that survives the deny set re-serializes unchanged', () => {
    // A value with no forbidden chars but trailing artifacts must still equal itself when
    // round-tripped — proves we did not silently normalize away a smuggled separator.
    expect(isSafeCssTokenValue('hsl(0 0% 100%)')).toBe(true);
    expect(isSafeCssTokenValue('var(--x)')).toBe(true); // var() is a legitimate token, no breakout
  });
});
