import type { StyleSpec, DesignConstraints } from '../compiler/style-spec'
import { ROLE_TOKENS } from '../compiler/roles'
import type { ThemePack } from '../registries/theme-packs'

// Tag-overlap few-shot selection: deterministic (score desc, registry order ties).
// Each word in the user request is checked against pack tags; the top n packs
// by overlap score serve as the system prompt's few-shot examples.
export function selectFewShotPacks(
  request: string,
  packs: readonly ThemePack[],
  n: number,
): ThemePack[] {
  const words = request.toLowerCase()
  const scored = packs.map((pack, i) => ({
    pack, i,
    score: pack.tags.reduce((s, tag) => s + (words.includes(tag.toLowerCase()) ? 1 : 0), 0),
  }))
  scored.sort((a, b) => b.score - a.score || a.i - b.i)
  return scored.slice(0, n).map((s) => s.pack)
}

export interface DesignerPromptInput {
  constraints: DesignConstraints
  fewShot: ThemePack[]
  currentSpec?: StyleSpec
}

// Build the Designer system prompt. Section order:
// 1. Role + mission
// 2. Role vocabulary (imported from ROLE_TOKENS — single source of truth)
// 2b. Structural field semantics (typography + framing carry vibe like color)
// 3. Developer constraint block (only lines whose value is present)
// 4. Taste principles 1, 2, 6 verbatim from the design-taste skill
// 5. Pack-shortcut rule
// 6. Three few-shot examples as labelled JSON blocks (each contains "rationale" key)
// 7. CURRENT DESIGN section when currentSpec is present
// 8. Closing output instruction
//
// IMPORTANT: do NOT use the word "rationale" in double quotes in prose — the
// test asserts exactly 3 occurrences of /"rationale"/ in the full prompt,
// one per JSON block.
export function buildDesignerPrompt(input: DesignerPromptInput): string {
  const { constraints, fewShot, currentSpec } = input

  // Section 1: role + mission
  const sections: string[] = []

  sections.push(
    `You are the Invariance Designer — a taste-producing agent that outputs a StyleSpec JSON object.
Your job is to interpret a user's vibe or style request and produce one coherent StyleSpec.
The compiler will expand the StyleSpec into every design token; you set direction, not values.`,
  )

  // Section 2: role vocabulary from ROLE_TOKENS (canonical single source of truth)
  sections.push(
    `ROLE VOCABULARY (the CSS custom properties the compiler will populate):
${ROLE_TOKENS.join(', ')}

Surfaces: --inv-surface-0 (page), --inv-surface-1 (cards/sidebar), --inv-surface-2 (elevated/popovers).
Text: --inv-text-primary, --inv-text-secondary, --inv-text-disabled.
Accent: --inv-accent, --inv-accent-hover, --inv-accent-contrast (text ON accent), --inv-accent-subtle (tinted background).
Structure: --inv-border, --inv-border-strong, --inv-ring (focus).
Type: --inv-font-display, --inv-font-body, --inv-font-mono.
Shape/space: --inv-radius-base, --inv-radius-lg, --inv-shadow-1, --inv-shadow-2, --inv-density-unit, --inv-border-width.
Type treatment (set by the typography field): --inv-display-transform, --inv-display-tracking, --inv-display-weight (how headings are cased, tracked, and weighted).
Spacing scale (set by the density field): --inv-space-2xs … --inv-space-2xl (one rhythm ramp; tight vs airy).
Layout geometry (set by the framing field): --inv-sidebar-w, --inv-card-w, --inv-card-w-wide, --inv-card-aspect, --inv-hero-min-h, --inv-section-gap (chrome widths, card sizing, hero height, section breathing room).`,
  )

  // Section 2b: structural field semantics — type treatment and layout carry vibe
  // as much as color does. Color alone rarely sells a strong vibe.
  sections.push(
    `STRUCTURE CARRIES VIBE (the typography and framing fields move structure, not color — a strong request should usually move at least one of them):

typography (heading treatment):
  standard      clean, neutral sans headings — modern, SaaS, default.
  display-caps  UPPERCASE, wide tracking, heavy — loud/retro/brutalist/poster/arcade energy.
  editorial     normal case, lighter weight, tight tracking — serif/magazine/calm/luxury.
  technical     UPPERCASE, medium tracking and weight — mono/terminal/data/label feel.

framing (layout rhythm):
  compact   narrow sidebar, small cards, short hero, tight rhythm — dense/utilitarian/terminal/arcade.
  standard  balanced default.
  spacious  wide sidebar, large cards, tall hero, airy rhythm — editorial/calm/premium/coastal.`,
  )

  // Section 3: developer constraint block (only when values are present)
  const constraintLines: string[] = []
  if (constraints.locked_tokens && Object.keys(constraints.locked_tokens).length > 0) {
    for (const [token, value] of Object.entries(constraints.locked_tokens)) {
      constraintLines.push(`  ${token}: ${value} (locked — do not change this token)`)
    }
  }
  if (constraints.accent_chroma_max !== undefined) {
    constraintLines.push(`  accent_chroma_max: ${constraints.accent_chroma_max} (compiler will enforce)`)
  }
  if (constraints.allowed_modes && constraints.allowed_modes.length > 0) {
    constraintLines.push(`  allowed_modes: ${constraints.allowed_modes.join(', ')}`)
  }
  if (constraints.contrast !== undefined) {
    constraintLines.push(`  contrast floor: ${constraints.contrast} (minimum WCAG ratio; compiler enforces)`)
  }
  if (constraintLines.length > 0) {
    sections.push(`DEVELOPER CONSTRAINTS (hard rules the compiler enforces — your spec must not violate them):\n${constraintLines.join('\n')}`)
  }

  // Section 4: taste principles 1, 2, 6 verbatim
  sections.push(
    `DESIGN PRINCIPLES (apply these to every spec you produce):

1. Commit to one coherent direction per theme. A spec should be describable in five words. If it needs "and", cut something.

2. Spend boldness in one place. One loud decision (the accent, the display face, the shadow language), everything else disciplined. Two loud decisions compete; three is noise.

6. The default answer to "more X" is to move 2-3 StyleSpec fields, not all 14. Restraint reads as intent. The structural fields (typography, framing) count toward that 2-3 budget — and they are often the right ones to spend it on: a vibe rarely lands on color alone.`,
  )

  // Section 5: pack-shortcut rule
  sections.push(
    `PACK-SHORTCUT RULE: When the user's request names a pack era or style directly ("brutalist"), start from that pack's spec and change at most 3 fields.`,
  )

  // Section 6: three few-shot examples as labelled JSON blocks
  // Each pack.spec object contains a "rationale" key — the test counts exactly 3 occurrences.
  const examplesBlock = fewShot
    .map((pack, i) => `Example ${i + 1} — ${pack.name}:\n${JSON.stringify(pack.spec, null, 2)}`)
    .join('\n\n')
  sections.push(`FEW-SHOT EXAMPLES (these are reference specs for the taste direction, not templates to copy):\n\n${examplesBlock}`)

  // Section 7: current design (only when present — relative requests move 2-3 fields)
  if (currentSpec) {
    sections.push(
      `CURRENT DESIGN (the active spec — for relative requests like "make it warmer" or "more contrast", move 2-3 fields from this, not all 14):\n${JSON.stringify(currentSpec, null, 2)}`,
    )
  }

  // Section 8: closing instruction
  sections.push('Output ONLY the StyleSpec JSON object — no prose, no markdown fences, no explanation.')

  return sections.join('\n\n')
}
