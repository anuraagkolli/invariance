import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface0: 'var(--inv-surface-0)',
        surface1: 'var(--inv-surface-1)',
        surface2: 'var(--inv-surface-2)',
        textPrimary: 'var(--inv-text-primary)',
        textSecondary: 'var(--inv-text-secondary)',
        textDisabled: 'var(--inv-text-disabled)',
        accent: 'var(--inv-accent)',
        accentHover: 'var(--inv-accent-hover)',
        accentContrast: 'var(--inv-accent-contrast)',
        accentSubtle: 'var(--inv-accent-subtle)',
        border: 'var(--inv-border)',
        borderStrong: 'var(--inv-border-strong)',
        ring: 'var(--inv-ring)',
      },
      borderRadius: {
        base: 'var(--inv-radius-base)',
        lg2: 'var(--inv-radius-lg)',
      },
      fontFamily: {
        display: 'var(--inv-font-display)',
        body: 'var(--inv-font-body)',
        mono: 'var(--inv-font-mono)',
      },
      boxShadow: {
        inv1: 'var(--inv-shadow-1)',
        inv2: 'var(--inv-shadow-2)',
      },
      // Themed spacing/geometry scale. Tailwind reads `spacing` for width,
      // padding, gap AND margin, so one key (e.g. `sm`) serves `gap-sm`, `px-sm`
      // and `w-sm`. The sidebar/card widths live here too so layout utilities
      // resolve to the same compiler-emitted tokens a theme rewrites.
      spacing: {
        '2xs': 'var(--inv-space-2xs)',
        xs: 'var(--inv-space-xs)',
        sm: 'var(--inv-space-sm)',
        md: 'var(--inv-space-md)',
        lg: 'var(--inv-space-lg)',
        xl: 'var(--inv-space-xl)',
        '2xl': 'var(--inv-space-2xl)',
        section: 'var(--inv-section-gap)',
        sidebar: 'var(--inv-sidebar-w)',
        card: 'var(--inv-card-w)',
        'card-wide': 'var(--inv-card-w-wide)',
      },
      minHeight: {
        hero: 'var(--inv-hero-min-h)',
      },
      borderWidth: {
        themed: 'var(--inv-border-width)',
      },
    },
  },
  plugins: [],
}

export default config
