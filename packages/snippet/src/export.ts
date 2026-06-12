import type { RoleAssignment, StyleSpec, ThemeJsonV2 } from 'invariance/headless'
import { canonicalStringify } from '@invariance/schema'
import { isValidV2Theme } from './validate'

// ---------------------------------------------------------------------------
// export: serialize the snippet's current theme as a downloadable theme.json v2.
//
// This is the BRIDGE artifact (DESIGN 2.2): a theme demoed in Trial Mode must
// drop into Product Mode after a scan. buildExportTheme emits the exact v2 shape
// the SDK consumes — roles from the cluster assignment, empty slots, and the
// styleSpec provenance when a Designer run produced one — and validates it with
// isValidV2Theme (the snippet's hand-rolled gate, same safe-CSS value allowlist as
// the SDK schema) so a malformed seed fails here, at export, not silently on the
// other side. base_app_version is 'trial' to mark provenance until a real scan
// stamps the app's version.
// ---------------------------------------------------------------------------

export function buildExportTheme(assignment: RoleAssignment, styleSpec?: StyleSpec): ThemeJsonV2 {
  const theme: ThemeJsonV2 = {
    version: 2,
    base_app_version: 'trial',
    theme: {
      roles: assignment.roles,
      slots: {},
      ...(styleSpec ? { styleSpec } : {}),
    },
  }
  if (!isValidV2Theme(theme)) {
    throw new Error('buildExportTheme produced an invalid v2 theme (unsafe role/slot value)')
  }
  return theme
}

export function downloadTheme(theme: ThemeJsonV2, filename = 'theme.json'): void {
  if (typeof document === 'undefined') return
  const blob = new Blob([canonicalStringify(theme)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
