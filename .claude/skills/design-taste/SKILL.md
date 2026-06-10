---
name: design-taste
description: >
  Use when authoring or editing the Designer agent's system prompt, the theme
  pack presets (registries/theme-packs.ts), the font pairing registry, demo app
  styling, or when evaluating whether a compiled theme "looks designed". Encodes
  the role vocabulary, StyleSpec field semantics, taste principles, and worked
  good-vs-bad examples. The product lives or dies on the quality of files this
  skill governs: do not write them generically.
---

# Design Taste

The Designer agent and the theme packs are where this product's taste lives.
Code written under this skill is judged by one question: would a professional
designer flinch at the output? Generic choices here are bugs, even when every
test passes.

## Role vocabulary (canonical, keep in sync with compiler/roles.ts)

Surfaces: --inv-surface-0 (page), --inv-surface-1 (cards/sidebar),
--inv-surface-2 (elevated/popovers).
Text: --inv-text-primary, --inv-text-secondary, --inv-text-disabled.
Accent: --inv-accent, --inv-accent-hover, --inv-accent-contrast (text ON accent),
--inv-accent-subtle (tinted background).
Structure: --inv-border, --inv-border-strong, --inv-ring (focus).
Type: --inv-font-display, --inv-font-body, --inv-font-mono.
Shape/space: --inv-radius-base, --inv-radius-lg, --inv-shadow-1, --inv-shadow-2,
--inv-density-unit, --inv-border-width.

## StyleSpec field semantics (what each field is FOR)

- accentHue/accentChroma: the personality color. One hue. Resist the urge to
  use secondaryHue unless the vibe genuinely needs a duotone (retro-arcade,
  candy). Most great themes are one accent plus disciplined neutrals.
- neutralTint + strength: the single most underrated quality lever. Pure gray
  neutrals (strength none) read as unfinished. Warm vibes tint toward 60-90
  (paper, cream), cool/tech toward 240-270, forest toward 140. 'subtle' is the
  default for taste; 'strong' only when the vibe IS the tinted field
  (warm-paper, midnight).
- contrast: 'soft' is for pastel/editorial calm, 'high' for brutalist/terminal/
  accessibility. Do not pick 'high' just to be safe; the compiler guarantees
  AA at every level.
- fontPairing: typography carries more of a vibe than color does. A retro theme
  with Inter is not retro. Match by registry tags first; if two pairings fit,
  pick the more characterful display with the quieter body.
- radius + shadow + borderWeight travel together as a coherent material
  language: sharp + hard-offset + heavy = neobrutalist; rounded + subtle +
  hairline = soft modern; sharp + flat + hairline = terminal/editorial.
  Mixing languages (pill radius with hard-offset shadows) is the #1 tell of a
  bad spec.
- density: compact for data-heavy/terminal, comfortable for editorial/pastel.
- rationale: one sentence, user-facing, names the direction ("Warm CRT retro:
  amber accent, mono type, sharp corners"). Not a feature list.

## Taste principles (apply to packs, Designer prompt, and demo styling)

1. Commit to one coherent direction per theme. A spec should be describable in
   five words. If it needs "and", cut something.
2. Spend boldness in one place. One loud decision (the accent, the display
   face, the shadow language), everything else disciplined. Two loud decisions
   compete; three is noise.
3. Neutrals are a design decision, not a default. Always ask: what temperature
   is this vibe's gray?
4. Typography is the strongest single signal. When a vibe request is ambiguous,
   the font pairing choice should resolve it more than the hue does.
5. Dark mode is not inverted light mode. Reduce chroma slightly, never use pure
   black (#000) surfaces or pure white text; the compiler ramps handle this,
   packs must not override it.
6. The default answer to "more X" is to move 2-3 StyleSpec fields, not all 12.
   Restraint reads as intent.

## Worked examples: "make it more retro"

GOOD spec:
{ mode: 'dark', accentHue: 55, accentChroma: 'vivid', neutralTint: 280,
  neutralTintStrength: 'subtle', contrast: 'standard',
  fontPairing: 'retro-terminal', radius: 'sharp', shadow: 'hard-offset',
  density: 'compact', borderWeight: 'heavy',
  rationale: 'CRT arcade: amber on deep violet-black, mono type, hard edges.' }
Why it works: one direction (arcade CRT), boldness spent on the amber accent
and mono type, tinted neutrals, material language consistent (sharp + hard +
heavy).

BAD spec (every field changed, no direction):
{ mode: 'light', accentHue: 25, accentChroma: 'vivid', secondaryHue: 200,
  neutralTint: 0, neutralTintStrength: 'none', contrast: 'soft',
  fontPairing: 'editorial-serif', radius: 'pill', shadow: 'hard-offset', ... }
Why it fails: serif + pill + hard-offset mixes three material languages; pure
gray neutrals; duotone with no reason; 'soft' contrast fighting 'vivid' chroma.
Syntactically valid, aesthetically random. The compiler will make it
accessible; nothing can make it coherent.

## Theme pack authoring checklist

For each pack: (1) name the direction in five words before picking fields;
(2) verify the material-language triple (radius/shadow/borderWeight) is
consistent; (3) compile it and run the oklch-compiler skill's check-contrast
script; (4) screenshot it on the demo via Playwright and look at it; (5) ask
the calibration question: would this spec come out the same for a DIFFERENT
vibe word? If yes, it is generic, redo it. Packs must be distinct from each
other: no two packs may share both fontPairing and accentHue within 30 degrees.

## Font pairing registry rules

Every entry needs: a characterful display face, a quieter body face that
shares its era/mood, real fallback stacks, and 2-4 honest tags. Never pair two
display faces. Include at least: mono/terminal, geometric grotesk, humanist
sans, editorial serif, slab, rounded/playful, condensed industrial. Verify
every family name against Google Fonts spelling exactly; a typo'd family
silently falls back and the theme loses its personality with no error.

## Designer system prompt rules

The prompt must contain: the role vocabulary above, the developer's constraint
block, exactly three packs as few-shot examples selected by tag overlap with
the user's request, and principles 1, 2, and 6 verbatim. It must instruct the
model to output ONLY the StyleSpec (structured outputs enforce shape, the
prompt enforces intent). Temperature 0.7. When the user's request names a pack
era or style directly ("brutalist"), the prompt instructs the Designer to
start from that pack and change at most 3 fields.
