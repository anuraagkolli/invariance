import type { Config } from 'tailwindcss'
import kitPreset from '@invariance/kit/tailwind-preset'

// The kit preset owns the --inv-* token mapping (colors, radii, fonts, shadows,
// themed spacing/geometry) so Nebula's own classes and the kit's variant
// recipes resolve to the same compiler-emitted tokens a theme rewrites.
const config: Config = {
  presets: [kitPreset],
  content: ['./src/**/*.{ts,tsx}', kitPreset.kitContent],
  plugins: [],
}

export default config
