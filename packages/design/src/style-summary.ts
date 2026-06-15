import type { StyleSpec } from './compiler/style-spec'

// Coarse hue → colour-name buckets (upper bound, exclusive) so the console can
// say "vivid blue accent" instead of "accentHue: 255".
const HUE_NAMES: ReadonlyArray<readonly [number, string]> = [
  [20, 'red'],
  [45, 'orange'],
  [70, 'amber'],
  [105, 'lime'],
  [150, 'green'],
  [195, 'teal'],
  [230, 'sky'],
  [265, 'blue'],
  [295, 'indigo'],
  [325, 'violet'],
  [350, 'magenta'],
  [360, 'red'],
]

function hueLabel(h: number): string {
  const x = ((h % 360) + 360) % 360
  for (const [upper, name] of HUE_NAMES) if (x < upper) return name
  return 'red'
}

/**
 * A short, human-readable phrase describing a StyleSpec — what the developer
 * console shows for a theme mod instead of 38 hex strings (e.g.
 * "dark · vivid amber accent · standard contrast · display-caps type"). Reads
 * design *intent*, never the compiled values.
 */
export function summarizeStyleSpec(spec: StyleSpec): string {
  const parts: string[] = [
    spec.mode,
    `${spec.accentChroma} ${hueLabel(spec.accentHue)} accent`,
    `${spec.contrast} contrast`,
  ]
  if (spec.typography && spec.typography !== 'standard') parts.push(`${spec.typography} type`)
  if (spec.radius !== 'subtle') parts.push(`${spec.radius} corners`)
  if (spec.density !== 'standard') parts.push(`${spec.density} density`)
  return parts.join(' · ')
}
