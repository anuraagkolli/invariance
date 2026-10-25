// Font pairings registry: taste as data, not code.
// Designer picks by id; families must match Google Fonts spelling exactly.
// A typo'd family name silently falls back to a system font, losing personality with no error.
// Exactness matters. Do not modify family names without verification.

export interface FontPairing {
  id: string
  display: string
  body: string
  mono?: string
  tags: string[]
}

export const DEFAULT_MONO_STACK = "'JetBrains Mono', ui-monospace, 'SF Mono', monospace"

export const FONT_PAIRINGS: FontPairing[] = [
  {
    id: 'retro-terminal',
    display: "'VT323', monospace",
    body: "'Space Mono', monospace",
    mono: "'Space Mono', monospace",
    tags: ['retro', 'terminal', 'mono', 'playful'],
  },
  {
    id: 'terminal-mono',
    display: "'IBM Plex Mono', ui-monospace, monospace",
    body: "'IBM Plex Sans', system-ui, sans-serif",
    mono: "'IBM Plex Mono', ui-monospace, monospace",
    tags: ['terminal', 'mono', 'tech'],
  },
  {
    id: 'geo-grotesk',
    display: "'Space Grotesk', system-ui, sans-serif",
    body: "'Inter', system-ui, sans-serif",
    tags: ['modern', 'tech', 'geometric', 'neutral'],
  },
  {
    id: 'editorial-serif',
    display: "'Playfair Display', Georgia, serif",
    body: "'Source Serif 4', Georgia, serif",
    tags: ['editorial', 'elegant', 'classic'],
  },
  {
    id: 'humanist-sans',
    display: "'Alegreya Sans', system-ui, sans-serif",
    body: "'Open Sans', system-ui, sans-serif",
    tags: ['humanist', 'warm', 'readable'],
  },
  {
    id: 'corporate-clean',
    display: "'Archivo', system-ui, sans-serif",
    body: "'Inter', system-ui, sans-serif",
    tags: ['corporate', 'neutral', 'professional'],
  },
  {
    id: 'slab-press',
    display: "'Zilla Slab', Georgia, serif",
    body: "'Source Sans 3', system-ui, sans-serif",
    tags: ['slab', 'sturdy', 'editorial'],
  },
  {
    id: 'rounded-friendly',
    display: "'Baloo 2', system-ui, sans-serif",
    body: "'Nunito', system-ui, sans-serif",
    tags: ['rounded', 'playful', 'friendly'],
  },
  {
    id: 'condensed-industrial',
    display: "'Oswald', system-ui, sans-serif",
    body: "'Roboto', system-ui, sans-serif",
    tags: ['condensed', 'industrial', 'bold'],
  },
  {
    id: 'brutalist-grotesk',
    display: "'Archivo Black', system-ui, sans-serif",
    body: "'Archivo', system-ui, sans-serif",
    tags: ['brutalist', 'heavy', 'loud'],
  },
  {
    id: 'pastel-soft',
    display: "'Quicksand', system-ui, sans-serif",
    body: "'Mulish', system-ui, sans-serif",
    tags: ['soft', 'rounded', 'calm'],
  },
  {
    id: 'mono-minimal',
    display: "'JetBrains Mono', ui-monospace, monospace",
    body: "'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
    tags: ['mono', 'minimal', 'tech'],
  },
]

export function getFontPairing(id: string): FontPairing | undefined {
  return FONT_PAIRINGS.find((p) => p.id === id)
}
