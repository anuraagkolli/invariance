// Generates the Nebula default :root role tier from the Theme Compiler.
// Run after `pnpm build` at the repo root: `node scripts/gen-default-tokens.mjs`.
// Paste the stdout block into globals.css under the generated-tokens comment.
// Default token values must come from the compiler, never hand-picked.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { compileTheme, themeToCssEntries } = require('invariance')

const spec = {
  mode: 'dark',
  accentHue: 12,
  accentChroma: 'vivid',
  neutralTint: 255,
  neutralTintStrength: 'subtle',
  contrast: 'standard',
  fontPairing: 'geo-grotesk',
  radius: 'subtle',
  shadow: 'subtle',
  density: 'standard',
  borderWeight: 'hairline',
  rationale: 'Nebula default: deep cool dark with one crimson accent.',
}

const { roles, warnings } = compileTheme(spec, {
  contrast: 4.5,
  accent_chroma_max: 0.25,
})

// Format through the same entries function the scanner + runtime use, so the
// demo baseline and scanner output share one CSS formatter.
const theme = { version: 2, base_app_version: 'v1', theme: { roles } }
console.log(
  themeToCssEntries(theme)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n'),
)

if (warnings.length) console.error('warnings:', warnings)
