// Smooth theme transition: briefly arms a global class so a token swap — a
// synchronous batch of :root style writes — morphs colors instead of snapping.
// Lives in the runtime (not the panel) because the apply path that needs it
// (persistAndApply) runs with or without a mounted overlay.

// Module-level (not per-instance) because the class lives on <html>, outside
// any one caller's lifecycle: an unmount must not strand it, and rapid calls
// (pack-chip mashing) should extend the window rather than stack removals.
let themeTransitionTimer: ReturnType<typeof setTimeout> | undefined

const STYLE_ID = 'inv-smooth-transition'

// The transition rule plus its reduced-motion neutralizer. Self-injected on
// first use so the morph never depends on some component's <style> being
// mounted — without this the class would be added but match no rule.
const TRANSITION_CSS = `
html.inv-theme-transition,
html.inv-theme-transition *,
html.inv-theme-transition *::before,
html.inv-theme-transition *::after {
  transition: background-color .55s ease, color .55s ease, border-color .55s ease, fill .55s ease, stroke .55s ease, box-shadow .55s ease !important;
}
@media (prefers-reduced-motion: reduce) {
  html.inv-theme-transition,
  html.inv-theme-transition *,
  html.inv-theme-transition *::before,
  html.inv-theme-transition *::after {
    transition: none !important;
  }
}
`

// Call this immediately BEFORE the token write; the class self-clears once the
// .55s transitions have finished. SSR-safe no-op without a document.
export function beginSmoothThemeTransition(): void {
  if (typeof document === 'undefined') return
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = TRANSITION_CSS
    document.head.appendChild(style)
  }
  document.documentElement.classList.add('inv-theme-transition')
  if (themeTransitionTimer !== undefined) clearTimeout(themeTransitionTimer)
  themeTransitionTimer = setTimeout(() => {
    document.documentElement.classList.remove('inv-theme-transition')
    themeTransitionTimer = undefined
  }, 700)
}
