import { describe, it, expect } from 'vitest'
import * as invariance from '../index'

describe('main entry exports', () => {
  it('exports themeToCssEntries', () => {
    expect(typeof invariance.themeToCssEntries).toBe('function')
  })
})
