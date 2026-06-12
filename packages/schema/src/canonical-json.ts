// Canonical JSON: recursively sorted object keys so identical documents are
// byte-identical. Future signing/content-addressing depends on stable bytes;
// adopting it now makes that an envelope later, not a data migration.
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    // Honor toJSON (Date, URL, ...) like JSON.stringify would — rebuilding from
    // Object.keys() would otherwise silently serialize such values as {}.
    const withToJson = value as { toJSON?: () => unknown }
    if (typeof withToJson.toJSON === 'function') return canonicalize(withToJson.toJSON())
    const record = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) sorted[key] = canonicalize(record[key])
    return sorted
  }
  return value
}
