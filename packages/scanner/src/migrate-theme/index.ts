import { ROLE_TOKENS, ThemeJsonV2Schema, upgradeThemeJson } from 'invariance'
import type { AnyThemeJson, ThemeJsonV2 } from 'invariance'

// ---------------------------------------------------------------------------
// invariance-migrate-theme: carry a stored user theme forward across a version
// bump. Same-named tokens/slots keep their user values; tokens/slots the
// current registry no longer knows are dropped (reported); renamed keys move
// to their new name via an optional rename map.
// ---------------------------------------------------------------------------

export interface ThemeMigrationReport {
  /** Role/slot keys kept because they're still in the current registry. */
  carried: string[]
  /** Keys dropped because the current registry no longer knows them. */
  dropped: string[]
  /** Keys moved to a new name via the rename map. */
  renamed: Array<{ from: string; to: string }>
  /** The migrated, schema-valid v2 document. */
  theme: ThemeJsonV2
}

export interface ThemeRegistry {
  /** Known role token keys now. Defaults to ROLE_TOKENS when omitted. */
  roles?: string[]
  /** Known slot token keys now (the --inv-* vars the source still references). */
  slots: string[]
}

/**
 * Carry a stored theme (v1 or v2) forward against the current registry.
 *
 * For each role/slot entry: a rename moves it to the new key (recorded under
 * renamed); otherwise an entry whose key is still in the registry is kept
 * (carried), and an entry absent from the registry is dropped (recorded).
 * Renames win over keep/drop so a key can be renamed even if its old name is no
 * longer in the registry. The output is validated against ThemeJsonV2Schema —
 * a failure here is a programmer error (bad rename target, etc.) and throws.
 */
export function migrateTheme(
  storedTheme: unknown,
  currentRegistry: ThemeRegistry,
  renames: Record<string, string> = {},
): ThemeMigrationReport {
  // Upgrade v1 -> v2 first so we always operate on roles/slots records.
  const upgraded = upgradeThemeJson(storedTheme as AnyThemeJson)
  const v2 = upgraded.theme

  const roleRegistry = new Set(currentRegistry.roles ?? ROLE_TOKENS)
  const slotRegistry = new Set(currentRegistry.slots)

  const carried: string[] = []
  const dropped: string[] = []
  const renamed: Array<{ from: string; to: string }> = []

  // Merge source roles + slots into one keyed view. The v1->v2 upgrade dumps
  // every legacy --inv-* global into `slots`, so a stored --inv-accent could
  // arrive under slots even though it's a role. We therefore decide each key's
  // destination bucket by REGISTRY membership, not by which source bucket it
  // came from — the registry is the current source of truth. On collision a
  // source-roles entry wins (it was authored as a role).
  const sourceEntries: Record<string, string> = {
    ...(v2.theme?.slots ?? {}),
    ...(v2.theme?.roles ?? {}),
  }

  const outRoles: Record<string, string> = {}
  const outSlots: Record<string, string> = {}

  // Place a value in the bucket its key belongs to: role registry -> roles,
  // else slot registry -> slots, else (renamed-only fallback) slots. The caller
  // asked for the move, so a rename target unknown to both registries still
  // lands somewhere valid rather than vanishing.
  function place(key: string, value: string): void {
    if (roleRegistry.has(key)) outRoles[key] = value
    else outSlots[key] = value
  }

  for (const [key, value] of Object.entries(sourceEntries)) {
    const to = renames[key]
    if (to !== undefined) {
      renamed.push({ from: key, to })
      place(to, value)
    } else if (roleRegistry.has(key) || slotRegistry.has(key)) {
      place(key, value)
      carried.push(key)
    } else {
      dropped.push(key)
    }
  }

  // Reassemble. Pass styleSpec, content/layout/components through untouched —
  // version bumps don't reshape design intent or non-theme sections.
  const themeSection: ThemeJsonV2['theme'] = {}
  if (Object.keys(outRoles).length > 0) themeSection!.roles = outRoles
  if (Object.keys(outSlots).length > 0) themeSection!.slots = outSlots
  if (v2.theme?.styleSpec !== undefined) themeSection!.styleSpec = v2.theme.styleSpec

  const migrated: ThemeJsonV2 = {
    version: 2,
    base_app_version: v2.base_app_version,
    ...(Object.keys(themeSection!).length > 0 ? { theme: themeSection } : {}),
  }
  if (v2.content !== undefined) migrated.content = v2.content
  if (v2.layout !== undefined) migrated.layout = v2.layout
  if (v2.components !== undefined) migrated.components = v2.components

  // Validate: a malformed migration (e.g. a rename target that isn't a valid
  // --inv-* key) is a programmer error — fail loudly rather than emit garbage.
  const parsed = ThemeJsonV2Schema.safeParse(migrated)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ')
    throw new Error(`migrateTheme produced an invalid v2 theme: ${issues}`)
  }

  return { carried, dropped, renamed, theme: migrated }
}
