import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { beginSmoothThemeTransition } from './customization-overlay'

// Minimal documentElement stub — avoids a jsdom dependency (same approach as
// runtime/apply-v2.test.ts). Returns the live class set for assertions.
function stubDocument(): Set<string> {
  const classes = new Set<string>()
  ;(globalThis as { document?: unknown }).document = {
    documentElement: {
      classList: {
        add: (c: string) => { classes.add(c) },
        remove: (c: string) => { classes.delete(c) },
      },
    },
  }
  return classes
}

describe('beginSmoothThemeTransition', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    // Drain the module-level self-clearing timer so state never leaks into the
    // next test, then drop the stub.
    vi.runAllTimers()
    vi.useRealTimers()
    delete (globalThis as { document?: unknown }).document
  })

  it('is a no-op without a document (SSR guard)', () => {
    delete (globalThis as { document?: unknown }).document
    expect(() => beginSmoothThemeTransition()).not.toThrow()
  })

  it('adds the transition class and removes it after the morph window', () => {
    const classes = stubDocument()
    beginSmoothThemeTransition()
    expect(classes.has('inv-theme-transition')).toBe(true)
    vi.advanceTimersByTime(699)
    expect(classes.has('inv-theme-transition')).toBe(true)
    vi.advanceTimersByTime(1)
    expect(classes.has('inv-theme-transition')).toBe(false)
  })

  it('rapid calls extend the window instead of stacking removals', () => {
    const classes = stubDocument()
    beginSmoothThemeTransition()
    vi.advanceTimersByTime(400)
    beginSmoothThemeTransition()
    // The first call's removal would have fired at t=700 — it must have been
    // cleared, so the class survives until the SECOND call's window closes.
    vi.advanceTimersByTime(300) // t = 700
    expect(classes.has('inv-theme-transition')).toBe(true)
    vi.advanceTimersByTime(400) // t = 1100 = second call + 700
    expect(classes.has('inv-theme-transition')).toBe(false)
  })
})
