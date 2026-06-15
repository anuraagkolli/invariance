import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ink: '#0a0b0d', surface: '#15161a' },
      fontFamily: {
        display: ["'Space Grotesk'", 'system-ui', 'sans-serif'],
        mono: ["'JetBrains Mono'", 'ui-monospace', 'SF Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
export default config
