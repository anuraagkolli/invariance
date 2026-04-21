// ---------------------------------------------------------------------------
// Deterministic CSS variable name generation for scanner-emitted --inv-* vars.
// ---------------------------------------------------------------------------

export const ROLE_ABBREV: Record<string, string> = {
  bg: 'bg',
  text: 'text',
  border: 'border',
  font: 'font',
  pad: 'pad',
  margin: 'margin',
  radius: 'radius',
}

export function kebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

export function cssVarFor(
  slotName: string,
  role: string,
  collisionSuffix?: number,
): string {
  const abbrev = ROLE_ABBREV[role] ?? kebab(role)
  const base = `--inv-${kebab(slotName)}-${abbrev}`
  if (collisionSuffix && collisionSuffix > 0) {
    return `${base}-${collisionSuffix}`
  }
  return base
}

export function roleForCssProperty(prop: string): string | null {
  if (prop === 'backgroundColor' || prop === 'background') return 'bg'
  if (prop === 'color') return 'text'
  if (prop === 'fontFamily') return 'font'
  if (prop === 'borderRadius') return 'radius'
  if (prop.startsWith('border') && prop.toLowerCase().includes('color')) return 'border'
  if (prop === 'borderColor' || prop === 'border') return 'border'
  if (prop === 'padding' || prop.startsWith('padding')) return 'pad'
  if (prop === 'margin' || prop.startsWith('margin')) return 'margin'
  return null
}
