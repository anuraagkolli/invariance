import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { startObserver } from './observe'

describe('startObserver', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls reapply once after the debounce window when the DOM mutates', async () => {
    const reapply = vi.fn()
    const stop = startObserver(reapply)
    document.body.appendChild(document.createElement('div'))
    // MutationObserver callbacks are microtasks; flush them, then advance timers.
    await Promise.resolve()
    expect(reapply).not.toHaveBeenCalled()
    vi.advanceTimersByTime(150)
    expect(reapply).toHaveBeenCalledTimes(1)
    stop()
  })

  it('debounces a burst of mutations into a single reapply', async () => {
    const reapply = vi.fn()
    const stop = startObserver(reapply, { debounceMs: 50 })
    for (let i = 0; i < 5; i++) {
      document.body.appendChild(document.createElement('span'))
      await Promise.resolve()
      vi.advanceTimersByTime(10) // each < debounce, so the timer keeps resetting
    }
    expect(reapply).not.toHaveBeenCalled()
    vi.advanceTimersByTime(50)
    expect(reapply).toHaveBeenCalledTimes(1)
    stop()
  })

  it('stops firing after the returned stop fn is called', async () => {
    const reapply = vi.fn()
    const stop = startObserver(reapply)
    stop()
    document.body.appendChild(document.createElement('div'))
    await Promise.resolve()
    vi.advanceTimersByTime(500)
    expect(reapply).not.toHaveBeenCalled()
  })

  it('ignores mutations confined to snippet-owned subtrees', async () => {
    const panel = document.createElement('div')
    panel.setAttribute('data-inv-snippet', '')
    document.body.appendChild(panel)
    await Promise.resolve()
    vi.advanceTimersByTime(200) // drain the append above

    const reapply = vi.fn()
    const stop = startObserver(reapply)
    // Mutate only inside the snippet panel — must not trigger a reapply.
    panel.appendChild(document.createElement('button'))
    await Promise.resolve()
    vi.advanceTimersByTime(200)
    expect(reapply).not.toHaveBeenCalled()
    stop()
  })
})
