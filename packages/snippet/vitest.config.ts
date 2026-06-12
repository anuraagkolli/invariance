import { defineConfig } from 'vitest/config'

// jsdom so mini-scan / virtual-tokens / observe can exercise getComputedStyle,
// MutationObserver and inline-style mutation against a synthetic DOM. The pure
// persist/export tests run fine here too (localStorage is jsdom-provided).
export default defineConfig({
  test: {
    environment: 'jsdom',
  },
})
