---
name: oklch-compiler
description: >
  Use when writing or modifying anything in packages/core/src/compiler/ (ramps,
  contrast solving, role assignment, theme packs compilation), when working with
  the culori library, or when debugging color output that looks wrong (muddy,
  neon, clipped, low contrast). Contains verified culori v4 API facts, OKLCH
  gotchas, and the compiler's correctness invariants. Run scripts/check-contrast.mjs
  on any token map you produce before declaring compiler work done.
---

# OKLCH Theme Compiler

The Theme Compiler is the quality guarantee of this product. It must be pure,
deterministic, and unable to emit an inaccessible or incoherent theme. The LLM
(Designer) picks intent; this code picks every actual value. If you find
yourself wanting the Designer to emit a hex value, stop: that is an
architecture violation (DESIGN_v6 section 1.2).

## culori v4 API (verified against 4.0.2, do not guess beyond this)

```ts
import { converter, formatHex, wcagContrast, clampChroma, toGamut, parse } from 'culori'

// Color objects are plain: { mode: 'oklch', l: 0.7, c: 0.15, h: 25 }
// l in [0,1], c roughly [0,0.4], h in degrees [0,360)

const toOklch = converter('oklch')        // returns a FUNCTION
toOklch('#1a1a2e')                        // -> { mode:'oklch', l, c, h }

formatHex({ mode:'oklch', l:0.7, c:0.15, h:25 })  // -> '#ed756e' (sRGB)

wcagContrast('#ffffff', '#000000')        // -> 21; accepts hex strings or color objects

clampChroma({ mode:'oklch', l:0.95, c:0.3, h:110 }, 'oklch')
// reduces c until the color fits sRGB, preserving l and h

const mapper = toGamut('rgb', 'oklch')    // toGamut RETURNS A FUNCTION, call it then
mapper({ mode:'oklch', l:0.6, c:0.4, h:330 })     // -> in-gamut color object
```

Gotchas that have burned people:
- `formatHex` silently clips out-of-gamut channels. ALWAYS gamut-map
  (`clampChroma` or `toGamut`) before `formatHex`, or vivid hues come out wrong.
- `h` can be `undefined` for achromatic colors (c near 0). Guard with `h ?? 0`
  before arithmetic.
- Max in-gamut chroma varies wildly by hue and lightness: yellows (h~110) allow
  high c at high l; blues (h~260) clip early. Never hardcode a chroma assuming
  it fits at every hue. Clamp per-step.
- OKLCH l is perceptual but NOT WCAG luminance. Equal l steps look even; they
  do not produce equal contrast ratios. Contrast must be solved numerically
  (below), never derived from l deltas.

## Ramp construction rules

- Neutral ramp: 11 steps, l from 0.98 down to 0.15 (light mode; reverse for
  dark). chroma by tint strength: none=0, subtle=0.02, strong=0.04, constant
  hue = neutralTint. Reduce chroma progressively in the darkest 3 steps
  (multiply by 0.6, 0.4, 0.25) to avoid muddy artifacts in warm hues.
- Accent ramp: 5 steps centered on the seed. chroma: muted=0.08, medium=0.15,
  vivid=0.22, each step clamped to gamut AFTER setting l.
- All ramp functions are pure: (spec fields) -> hex[]. No Date, no random.

## Contrast solving (the core invariant)

```
solveTextL(surfaceHex, hue, chroma, targetRatio):
  binary search l in [0,1], 24 iterations
  candidate = clampChroma({ mode:'oklch', l, c: chroma, h: hue }, 'oklch')
  ratio = wcagContrast(formatHex(candidate), surfaceHex)
  search direction: if surface is light (wcag luminance > 0.5), lower l raises
  ratio; if dark, higher l raises it. Compute surface luminance once, branch once.
  return the first candidate meeting targetRatio with minimal distance from
  the ramp's nearest step (keeps solved text colors harmonious with the ramp).
```

Targets: standard=4.5, high=7.0, soft=4.5 for body text but 3.0 permitted only
for tokens explicitly marked large-text. If the search cannot reach the target
at the given hue/chroma (rare, vivid yellows on white), retry with chroma
halved, then with chroma 0. Never return a failing pair.

Worked example (real, measured): white on the demo brand accent #e94560 is
3.83, a FAIL at 4.5. Black on it is 5.48, a PASS. So accent-contrast must be
SOLVED per accent, never defaulted to white. Mid-lightness accents (l ~0.6-0.7)
frequently fail against both pure white and very light text; the luminance
branch in the solver handles this by searching downward. Do not "fix" such
cases by nudging the locked accent: locked tokens are immutable, the
dependent token moves.

## Compiler invariants (test every one)

1. Determinism: identical StyleSpec in, byte-identical token map out.
2. Completeness: every role in the vocabulary (see design-taste skill) present.
3. Contrast: every declared (text, surface) pair meets target. Verified
   independently by verify/contrastPairs, but the compiler must already hold it.
4. Gamut: every emitted hex round-trips (parse -> formatHex -> same string).
5. Locked tokens: pass through byte-identical; dependent tokens solve AROUND
   them (e.g. locked accent: solve accent-contrast against the locked value).

## Workflow

1. Before editing, read DESIGN_v6.md sections 1.4-1.5 and the golden snapshot
   tests in compiler/*.test.ts.
2. After any change, run the unit tests, then:
   `node .claude/skills/oklch-compiler/scripts/check-contrast.mjs <tokens.json>`
   which prints every pair's ratio and exits nonzero on a failure. A compiler
   change is not done until this passes on all theme packs.
3. If output "looks wrong" in a screenshot: check gamut clamping first, hue
   undefined second, l direction in the contrast solver third. These cause 90%
   of visual bugs.
