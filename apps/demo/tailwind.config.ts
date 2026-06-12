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
    },
  },
  plugins: [],
}

export default config
