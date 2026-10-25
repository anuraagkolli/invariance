// Tailwind preset that maps utilities onto the Invariance role tokens
// (--inv-*). Every kit recipe is written against these keys, so an app using
// the kit must include this preset AND the kit sources in `content`:
//
//   presets: [kitPreset], content: ['./src/**/*.{ts,tsx}', kitPreset.kitContent]
const path = require('path')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [],
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
      // Tailwind reads `spacing` for width, padding, gap AND margin, so one key
      // serves `gap-sm`, `px-sm` and `w-sm`.
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
      keyframes: {
        'inv-marquee': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'inv-marquee': 'inv-marquee var(--inv-marquee-duration, 40s) linear infinite',
      },
    },
  },
  plugins: [],
}

module.exports.kitContent = path.join(__dirname, 'src/**/*.{ts,tsx}')
