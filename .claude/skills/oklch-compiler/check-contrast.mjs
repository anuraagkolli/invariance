#!/usr/bin/env node
// check-contrast.mjs -- verify every (text, surface) role pair in a token map
// meets its WCAG target. Zero dependencies; runnable from anywhere.
// Usage: node check-contrast.mjs tokens.json [--target 4.5]
// Accepts a flat token map or a full theme.json (uses .theme.roles).
// Exit 0 = all pass, 1 = failures, 2 = bad input.

import { readFileSync } from 'node:fs'

// WCAG 2.x relative luminance + contrast, inlined so the script needs no deps
const srgbChannel = (c) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const luminance = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new Error(`not a 6-digit hex color: ${hex}`)
  const n = parseInt(m[1], 16)
  return (
    0.2126 * srgbChannel((n >> 16) & 255) +
    0.7152 * srgbChannel((n >> 8) & 255) +
    0.0722 * srgbChannel(n & 255)
  )
}
const contrast = (a, b) => {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

const PAIRS = [
  // [text token, surface token, kind]  'body' uses --target, 'large' uses 3.0
  ['--inv-text-primary', '--inv-surface-0', 'body'],
  ['--inv-text-primary', '--inv-surface-1', 'body'],
  ['--inv-text-primary', '--inv-surface-2', 'body'],
  ['--inv-text-secondary', '--inv-surface-0', 'body'],
  ['--inv-text-secondary', '--inv-surface-1', 'body'],
  ['--inv-accent-contrast', '--inv-accent', 'body'],
  ['--inv-accent', '--inv-surface-0', 'large'],
]

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
const tIdx = args.indexOf('--target')
const target = tIdx !== -1 ? Number(args[tIdx + 1]) : 4.5
const LARGE = 3.0

if (!file) {
  console.error('usage: node check-contrast.mjs <tokens.json> [--target 4.5]')
  process.exit(2)
}

let raw
try {
  raw = JSON.parse(readFileSync(file, 'utf8'))
} catch (e) {
  console.error(`cannot read ${file}: ${e.message}`)
  process.exit(2)
}

const tokens = raw['--inv-surface-0'] ? raw : raw?.theme?.roles
if (!tokens) {
  console.error('input is neither a token map nor a theme.json with theme.roles')
  process.exit(2)
}

const isVarRef = (v) => typeof v === 'string' && v.startsWith('var(')
let failures = 0
let checked = 0

for (const [textKey, surfaceKey, kind] of PAIRS) {
  const text = tokens[textKey]
  const surface = tokens[surfaceKey]
  if (!text || !surface) {
    console.log(`SKIP  ${textKey} on ${surfaceKey} (token missing)`)
    continue
  }
  if (isVarRef(text) || isVarRef(surface)) {
    console.log(`SKIP  ${textKey} on ${surfaceKey} (unresolved var() ref)`)
    continue
  }
  const required = kind === 'large' ? LARGE : target
  let ratio
  try {
    ratio = contrast(text, surface)
  } catch (e) {
    console.log(`FAIL  ${textKey} on ${surfaceKey}: ${e.message}`)
    failures++
    continue
  }
  checked++
  const ok = ratio >= required
  if (!ok) failures++
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${textKey} on ${surfaceKey}: ${ratio.toFixed(2)} (need ${required})`
  )
}

console.log(`\n${checked} pairs checked, ${failures} failures`)
process.exit(failures > 0 ? 1 : 0)
