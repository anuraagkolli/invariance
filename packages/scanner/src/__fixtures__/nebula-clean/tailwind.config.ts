import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0a0b0d',
        panel: '#1f2225',
        line: '#707883',
        cloud: '#f4f9ff',
        crimson: '#ee4c6e',
      },
    },
  },
  plugins: [],
}
export default config
