// Single source of truth for the verified pair matrix: golden tests, the verify
// engine, and (later) CI tooling must not drift from each other.
//
// secondaryTarget defaults to 4.5 (the standard WCAG AA level for normal text).
// verifyV2 raises it to match the developer's contrast floor so the check stays
// at least as strict as the compiler's own secondary-text ramp target.
export function contrastPairs(primaryTarget: number, secondaryTarget = 4.5): Array<[string, string, number]> {
  return [
    ['--inv-text-primary', '--inv-surface-0', primaryTarget],
    ['--inv-text-primary', '--inv-surface-1', primaryTarget],
    ['--inv-text-primary', '--inv-surface-2', primaryTarget],
    ['--inv-text-secondary', '--inv-surface-0', secondaryTarget],
    ['--inv-text-secondary', '--inv-surface-1', secondaryTarget],
    ['--inv-text-primary', '--inv-accent-subtle', 4.5],
    ['--inv-accent-contrast', '--inv-accent', 4.5],
    ['--inv-accent-contrast', '--inv-accent-hover', 4.5],
    ['--inv-text-disabled', '--inv-surface-1', 3.0],
    ['--inv-ring', '--inv-surface-0', 3.0],
    ['--inv-ring', '--inv-surface-1', 3.0],
    ['--inv-accent', '--inv-surface-0', 3.0],
  ]
}
