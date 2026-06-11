import { describe, it, expect } from 'vitest'
import { canonicalStringify } from './canonical-json'

describe('canonicalStringify', () => {
  it('produces identical bytes regardless of key insertion order', () => {
    const a = { version: 2, theme: { slots: { x: '1' }, roles: { b: '2', a: '3' } } }
    const b = { theme: { roles: { a: '3', b: '2' }, slots: { x: '1' } }, version: 2 }
    expect(canonicalStringify(a)).toBe(canonicalStringify(b))
  })

  it('preserves array order and round-trips losslessly', () => {
    const doc = { layout: { pages: { '/': { sections: ['hero', 'grid'], hidden: [] } } } }
    expect(JSON.parse(canonicalStringify(doc))).toEqual(doc)
    expect(canonicalStringify(doc)).toContain('["hero","grid"]')
  })
})
