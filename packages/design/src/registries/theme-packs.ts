import type { StyleSpec } from '../compiler/style-spec'

// Named StyleSpec presets. Three uses: few-shot taste examples in the Designer
// prompt, shortcuts when a request names a style, one-tap starting points in
// the panel. Free-form requests do NOT pass through packs.
// tags: phase-3 few-shot selection — the Designer picks a pack by tag-overlap
// with the user's intent words before looking at spec fields.
export interface ThemePack {
  id: string
  name: string
  tags: readonly string[]
  spec: StyleSpec
}

export const THEME_PACKS: ThemePack[] = [
  {
    id: 'retro-arcade',
    name: 'Retro Arcade',
    tags: ['retro', 'arcade', 'dark', 'playful'],
    spec: {
      mode: 'dark', accentHue: 55, accentChroma: 'vivid',
      neutralTint: 280, neutralTintStrength: 'subtle', contrast: 'standard',
      fontPairing: 'retro-terminal', radius: 'sharp', shadow: 'hard-offset',
      density: 'compact', borderWeight: 'heavy', typography: 'display-caps', framing: 'compact',
      rationale: 'CRT arcade: amber on deep violet-black, mono type, hard edges.',
    },
  },
  {
    id: 'neobrutalist',
    name: 'Neobrutalist',
    tags: ['brutalist', 'bold', 'loud', 'high-contrast'],
    spec: {
      mode: 'light', accentHue: 350, accentChroma: 'vivid',
      neutralTint: 0, neutralTintStrength: 'none', contrast: 'high',
      fontPairing: 'brutalist-grotesk', radius: 'sharp', shadow: 'hard-offset',
      density: 'standard', borderWeight: 'heavy', typography: 'display-caps', framing: 'compact',
      rationale: 'Stark neobrutalism: hot pink accent, black hard shadows, heavy borders.',
    },
  },
  {
    id: 'soft-pastel',
    name: 'Soft Pastel',
    tags: ['pastel', 'soft', 'calm', 'rounded'],
    spec: {
      mode: 'light', accentHue: 330, accentChroma: 'muted',
      neutralTint: 330, neutralTintStrength: 'subtle', contrast: 'soft',
      fontPairing: 'pastel-soft', radius: 'rounded', shadow: 'subtle',
      density: 'comfortable', borderWeight: 'hairline', typography: 'editorial', framing: 'spacious',
      rationale: 'Powder pastel: blush accent, rounded corners, airy spacing.',
    },
  },
  {
    id: 'terminal-green',
    name: 'Terminal Green',
    tags: ['terminal', 'mono', 'hacker', 'dark'],
    spec: {
      mode: 'dark', accentHue: 145, accentChroma: 'vivid',
      neutralTint: 145, neutralTintStrength: 'subtle', contrast: 'high',
      fontPairing: 'terminal-mono', radius: 'sharp', shadow: 'flat',
      density: 'compact', borderWeight: 'hairline', typography: 'technical', framing: 'compact',
      rationale: 'Phosphor terminal: green on near-black, mono type, dead flat.',
    },
  },
  {
    id: 'glass-dark',
    name: 'Dark Glass',
    tags: ['glass', 'dark', 'tech', 'modern'],
    spec: {
      mode: 'dark', accentHue: 215, accentChroma: 'medium',
      neutralTint: 240, neutralTintStrength: 'subtle', contrast: 'standard',
      fontPairing: 'geo-grotesk', radius: 'rounded', shadow: 'pronounced',
      density: 'standard', borderWeight: 'hairline', typography: 'standard', framing: 'standard',
      rationale: 'Dark glass: cool blue glow, deep soft shadows, rounded panes.',
    },
  },
  {
    id: 'editorial',
    name: 'Editorial',
    tags: ['editorial', 'print', 'serif', 'classic'],
    spec: {
      mode: 'light', accentHue: 15, accentChroma: 'muted',
      neutralTint: 70, neutralTintStrength: 'subtle', contrast: 'standard',
      fontPairing: 'editorial-serif', radius: 'sharp', shadow: 'flat',
      density: 'comfortable', borderWeight: 'hairline', typography: 'editorial', framing: 'spacious',
      rationale: 'Quiet print: serif type, paper-warm neutrals, oxblood accent.',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    tags: ['ocean', 'coastal', 'fresh', 'friendly'],
    spec: {
      mode: 'light', accentHue: 195, accentChroma: 'medium',
      neutralTint: 210, neutralTintStrength: 'subtle', contrast: 'standard',
      fontPairing: 'rounded-friendly', radius: 'rounded', shadow: 'subtle',
      density: 'comfortable', borderWeight: 'hairline', typography: 'standard', framing: 'spacious',
      rationale: 'Beach glass: aqua accent, rounded shapes, breezy spacing.',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    tags: ['sunset', 'warm', 'poster', 'dramatic'],
    spec: {
      mode: 'dark', accentHue: 25, accentChroma: 'vivid', secondaryHue: 320,
      neutralTint: 300, neutralTintStrength: 'subtle', contrast: 'standard',
      fontPairing: 'condensed-industrial', radius: 'sharp', shadow: 'pronounced',
      density: 'standard', borderWeight: 'standard', typography: 'display-caps', framing: 'standard',
      rationale: 'Dusk poster: burnt orange over violet dusk, condensed display type.',
    },
  },
  {
    id: 'mono',
    name: 'Monochrome',
    tags: ['monochrome', 'minimal', 'grayscale'],
    spec: {
      mode: 'light', accentHue: 250, accentChroma: 'muted',
      neutralTint: 0, neutralTintStrength: 'none', contrast: 'high',
      fontPairing: 'mono-minimal', radius: 'sharp', shadow: 'flat',
      density: 'compact', borderWeight: 'hairline', typography: 'technical', framing: 'compact',
      rationale: 'Grayscale studio: ink on white, monospace accents, no decoration.',
    },
  },
  // deliberately the quietest pack: corporate trust IS restraint (taste principle 6)
  {
    id: 'corporate-trust',
    name: 'Corporate Trust',
    tags: ['corporate', 'professional', 'calm', 'neutral'],
    spec: {
      mode: 'light', accentHue: 245, accentChroma: 'medium',
      neutralTint: 240, neutralTintStrength: 'subtle', contrast: 'standard',
      fontPairing: 'corporate-clean', radius: 'subtle', shadow: 'subtle',
      density: 'standard', borderWeight: 'standard', typography: 'standard', framing: 'standard',
      rationale: 'Calm corporate: navy accent, quiet depth, clean sans.',
    },
  },
]
