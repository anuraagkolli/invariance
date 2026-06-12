import { getFontPairing } from '../registries/font-pairings'

// Inject a Google Fonts <link> for a registry pairing on demand. Idempotent
// (keyed link ids); never loads system/generic stacks. Moved here from the demo
// gauntlet so every theme-apply path can load its pairing's faces, not just the
// gauntlet route.

// Families that ship with the OS or are CSS generics — never on Google Fonts.
// Requesting them yields a 400 and a console error, so we filter them out.
const SYSTEM_FAMILIES = new Set(
  ['Inter', 'system-ui', 'ui-monospace', 'SF Mono', 'monospace', 'sans-serif', 'serif'].map((f) =>
    f.toLowerCase(),
  ),
)

// Extract the primary family name from a CSS font stack, ready for a Google
// Fonts `family=` param (spaces → '+'):
//   "'VT323', monospace"                  → "VT323"
//   "'IBM Plex Mono', ui-monospace, ..."  → "IBM+Plex+Mono"
// Returns null for system/generic families (not hostable on Google Fonts).
function extractGoogleFontName(cssStack: string): string | null {
  const match = cssStack.match(/['"]([^'"]+)['"]/)
  if (!match || !match[1]) return null
  const name = match[1]
  if (SYSTEM_FAMILIES.has(name.toLowerCase())) return null
  return name.replace(/ /g, '+')
}

// Build the Google Fonts css2 URL for a pairing's display + body families, or
// null when neither family is hostable (a pure-system pairing needs no link).
// Pure: no DOM access, unit-tested directly.
export function googleFontsUrlFor(pairingId: string): string | null {
  const pairing = getFontPairing(pairingId)
  if (!pairing) return null

  const display = extractGoogleFontName(pairing.display)
  const body = extractGoogleFontName(pairing.body)

  const families: string[] = []
  if (display) families.push(`family=${display}:wght@400;500;700`)
  // Skip body when it resolves to the same family as display — one param suffices.
  if (body && body !== display) families.push(`family=${body}:wght@400;500;700`)
  if (families.length === 0) return null

  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`
}

// Inject the pairing's <link> into <head>, keyed by a stable id so repeated
// calls (re-apply, React strict-mode double-invoke) are idempotent. No-ops
// server-side and for pairings with no hostable families.
export function ensureFontsLoaded(pairingId: string): void {
  if (typeof document === 'undefined') return

  const href = googleFontsUrlFor(pairingId)
  if (!href) return

  const linkId = `inv-font-${pairingId}`
  if (document.getElementById(linkId)) return // already injected

  const link = document.createElement('link')
  link.id = linkId
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}
