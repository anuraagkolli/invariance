'use client'

import { useEffect } from 'react'

/**
 * Onboarding preview bridge (dev-time only). When Nebula is loaded inside the
 * Console's onboarding wizard — i.e. with `?inv-onboard=1` — this listens for
 * postMessage commands from the wizard and draws a highlight overlay on the
 * live page: the active section, a token's color, or a font. The wizard can't
 * touch this cross-origin document's DOM directly, so all highlighting happens
 * here. Renders nothing (and attaches nothing) outside the wizard.
 *
 * Protocol (wizard → bridge), messages shaped `{ source: 'inv-onboard', ... }`:
 *   { type: 'highlight-section', domIndex, name? }
 *   { type: 'highlight-color', value }
 *   { type: 'highlight-font', family }
 *   { type: 'clear' }
 * Bridge → wizard: `{ source: 'inv-onboard-bridge', type: 'ready', path }`.
 */
export function OnboardBridge() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (!params.has('inv-onboard')) return

    // --- overlay element -----------------------------------------------------
    const box = document.createElement('div')
    box.style.cssText = [
      'position:fixed',
      'z-index:2147483646',
      'pointer-events:none',
      'border:2px solid #ee4c6e',
      'border-radius:6px',
      'box-shadow:0 0 0 9999px rgba(0,0,0,0.45)',
      'transition:all .18s cubic-bezier(.2,.7,.3,1)',
      'opacity:0',
    ].join(';')
    const label = document.createElement('div')
    label.style.cssText = [
      'position:absolute',
      'top:-26px',
      'left:-2px',
      'font:600 12px/1 ui-sans-serif,system-ui,sans-serif',
      'color:#fff',
      'background:#ee4c6e',
      'padding:5px 8px',
      'border-radius:5px',
      'white-space:nowrap',
    ].join(';')
    box.appendChild(label)
    document.body.appendChild(box)

    let hideTimer: number | undefined

    function place(rect: DOMRect, text: string) {
      if (hideTimer) window.clearTimeout(hideTimer)
      box.style.opacity = '1'
      box.style.top = `${rect.top}px`
      box.style.left = `${rect.left}px`
      box.style.width = `${rect.width}px`
      box.style.height = `${rect.height}px`
      label.textContent = text
    }
    function clear() {
      box.style.opacity = '0'
    }

    /** The page's primary content container (Shell renders <main>). */
    function container(): Element {
      return (
        document.querySelector('main') ??
        document.querySelector('#app-root') ??
        document.body
      )
    }

    function highlightSection(domIndex: number, name?: string) {
      const kids = Array.from(container().children).filter(
        (n) => n.nodeType === 1,
      ) as HTMLElement[]
      const el = kids[domIndex]
      if (!el) return clear()
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // recompute after the scroll settles
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => place(el.getBoundingClientRect(), name ?? `section ${domIndex}`)),
      )
    }

    // Normalize any CSS color to "rgb(r, g, b)" via the browser.
    const probe = document.createElement('span')
    probe.style.display = 'none'
    document.body.appendChild(probe)
    function normColor(value: string): string {
      probe.style.color = ''
      probe.style.color = value
      return getComputedStyle(probe).color
    }

    function highlightColor(value: string) {
      const target = normColor(value)
      if (!target) return clear()
      const els = container().querySelectorAll<HTMLElement>('*')
      let count = 0
      for (const el of Array.from(els).slice(0, 4000)) {
        const cs = getComputedStyle(el)
        if (cs.backgroundColor === target || cs.color === target || cs.borderColor === target) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          window.requestAnimationFrame(() =>
            window.requestAnimationFrame(() => place(el.getBoundingClientRect(), value)),
          )
          count++
          break
        }
      }
      if (count === 0) clear()
    }

    function highlightFont(family: string) {
      const needle = family.toLowerCase().split(',')[0]!.replace(/['"]/g, '').trim()
      const els = container().querySelectorAll<HTMLElement>('h1,h2,h3,p,span,a,button,li,div')
      for (const el of Array.from(els).slice(0, 3000)) {
        const ff = getComputedStyle(el).fontFamily.toLowerCase()
        if (ff.includes(needle) && el.textContent && el.textContent.trim().length > 1) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          window.requestAnimationFrame(() =>
            window.requestAnimationFrame(() => place(el.getBoundingClientRect(), family)),
          )
          return
        }
      }
      clear()
    }

    function onMessage(ev: MessageEvent) {
      const data = ev.data
      if (!data || data.source !== 'inv-onboard') return
      switch (data.type) {
        case 'highlight-section':
          return highlightSection(Number(data.domIndex), data.name)
        case 'highlight-color':
          return highlightColor(String(data.value))
        case 'highlight-font':
          return highlightFont(String(data.family))
        case 'clear':
          return clear()
      }
    }

    window.addEventListener('message', onMessage)
    // Tell the wizard we're live (and on which route).
    try {
      window.parent?.postMessage(
        { source: 'inv-onboard-bridge', type: 'ready', path: window.location.pathname },
        '*',
      )
    } catch {
      // ignore — not embedded
    }

    return () => {
      window.removeEventListener('message', onMessage)
      box.remove()
      probe.remove()
      if (hideTimer) window.clearTimeout(hideTimer)
    }
  }, [])

  return null
}
