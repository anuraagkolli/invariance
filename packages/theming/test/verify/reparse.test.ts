// packages/theming/test/verify/reparse.test.ts
import { describe, it, expect } from 'vitest';
import { reparseToOklch } from '../../src/verify/reparse.js';

describe('reparseToOklch', () => {
  it('re-parses a function-shaped value with explicit space', () => {
    const o = reparseToOklch('oklch(0.62 0.19 29.2)', 'oklch');
    expect(o).not.toBeNull();
    expect(o!.l).toBeCloseTo(0.62, 2);
    expect(o!.c).toBeCloseTo(0.19, 2);
  });

  it('re-parses a function-shaped hsl value', () => {
    const o = reparseToOklch('hsl(0 0% 100%)', 'hsl');
    expect(o).not.toBeNull();
    expect(o!.l).toBeCloseTo(1, 1); // white -> L ~ 1
  });

  it('re-parses a bare hsl triple by reconstructing the function from space', () => {
    const o = reparseToOklch('0 0% 100%', 'hsl');
    expect(o).not.toBeNull();
    expect(o!.l).toBeCloseTo(1, 1);
  });

  it('re-parses a bare rgb triple by reconstructing the function from space', () => {
    const o = reparseToOklch('0 0 0', 'rgb');
    expect(o).not.toBeNull();
    expect(o!.l).toBeCloseTo(0, 1); // black -> L ~ 0
  });

  it('re-parses a hex value (space null, function-or-raw shape)', () => {
    const o = reparseToOklch('#000000', null);
    expect(o).not.toBeNull();
    expect(o!.l).toBeCloseTo(0, 1);
  });

  it('returns null for an unparseable / breakout value', () => {
    expect(reparseToOklch('red } body {', 'hsl')).toBeNull();
    expect(reparseToOklch('not-a-color', 'oklch')).toBeNull();
    expect(reparseToOklch('', null)).toBeNull();
  });
});
