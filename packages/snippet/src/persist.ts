import { ThemeJsonV2Schema } from 'invariance/headless'
import type { ThemeJsonV2 } from 'invariance/headless'
import { canonicalStringify } from '@invariance/schema'

// ---------------------------------------------------------------------------
// persist: per-origin localStorage for the snippet's current theme.
//
// Keyed by location.origin so a tester can demo different staging sites in the
// same browser without collision. Persistence is per-browser by design — an
// honest limitation the panel surfaces, and the reason Product Mode ships themes
// to all users instead.
//
// Save canonicalizes (sorted keys) so equal themes serialize to identical bytes.
// Load is defensive: localStorage is user-editable, so a stored value is parsed
// and re-validated against ThemeJsonV2Schema (the same value-allowlist gate the
// SDK uses) — any failure yields null rather than applying untrusted CSS.
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'invariance-snippet:'

export function snippetStorageKey(): string {
  const origin = typeof location !== 'undefined' ? location.origin : 'unknown'
  return `${KEY_PREFIX}${origin}`
}

export function saveSnippetTheme(theme: ThemeJsonV2): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(snippetStorageKey(), canonicalStringify(theme))
  } catch {
    // Quota / disabled storage — non-fatal; the in-memory theme still applies.
  }
}

export function loadSnippetTheme(): ThemeJsonV2 | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(snippetStorageKey())
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const result = ThemeJsonV2Schema.safeParse(parsed)
  return result.success ? (result.data as ThemeJsonV2) : null
}
