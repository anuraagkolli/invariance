export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex)
  if (!match?.[1]) return null
  return {
    r: parseInt(match[1].substring(0, 2), 16),
    g: parseInt(match[1].substring(2, 4), 16),
    b: parseInt(match[1].substring(4, 6), 16),
  }
}

function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs! + 0.7152 * gs! + 0.0722 * bs!
}

export function contrastRatio(hex1: string, hex2: string): number {
  const c1 = hexToRgb(hex1)
  const c2 = hexToRgb(hex2)
  if (!c1 || !c2) return 0
  const l1 = luminance(c1.r, c1.g, c1.b)
  const l2 = luminance(c2.r, c2.g, c2.b)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

export function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

export function looksLikeColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

export function extractColorsFromStyleValue(value: string): string[] {
  const matches = value.match(/#[0-9a-fA-F]{6}/g)
  return matches ?? []
}
