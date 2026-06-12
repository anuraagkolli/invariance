import { promises as fs } from 'fs'

// ---------------------------------------------------------------------------
// Shared theme-token helpers for the CLI guards (invariance-check and
// invariance-migrate-theme). Both read a stored theme.json (v1 or v2) to learn
// which --inv-* SLOT tokens it advertises, and both need a "read JSON if the
// file exists" helper. Kept in one place so the two CLIs can't drift apart.
// ---------------------------------------------------------------------------

/** Read+parse a JSON file, returning undefined when it doesn't exist. */
export async function readJsonIfExists(filePath: string): Promise<unknown | undefined> {
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf-8')
  } catch {
    return undefined
  }
  return JSON.parse(raw) as unknown
}

/**
 * The --inv-* SLOT token keys a theme advertises (v1 or v2 shape), in document
 * order. Returns an array; callers needing a Set convert at the call site.
 *
 * WHY slots only: slot tokens are the ones the scanner wires into source as
 * var(--inv-*) references — those are what a "missing-token" regression removes,
 * and the ones a version bump carries forward. Role tokens (theme.roles) live on
 * :root via the runtime/compiler and are never referenced by name in source, so
 * they belong to the role registry, not the slot one. A v1 theme has no
 * roles/slots split: its globals partition into slots on upgrade, so we read
 * globals here too.
 */
export function slotTokensFromTheme(theme: unknown): string[] {
  const out: string[] = []
  if (typeof theme !== 'object' || theme === null) return out
  const t = (theme as { theme?: unknown }).theme
  if (typeof t !== 'object' || t === null) return out
  // v2: theme.slots is a flat { '--inv-*': value } record.
  const slots = (t as Record<string, unknown>).slots
  if (typeof slots === 'object' && slots !== null) {
    for (const key of Object.keys(slots)) {
      if (key.startsWith('--inv-')) out.push(key)
    }
  }
  // v1: theme.globals carries flat --inv-* keys (these become slots on upgrade).
  const globals = (t as { globals?: unknown }).globals
  if (typeof globals === 'object' && globals !== null) {
    for (const key of Object.keys(globals)) {
      if (key.startsWith('--inv-')) out.push(key)
    }
  }
  return out
}
