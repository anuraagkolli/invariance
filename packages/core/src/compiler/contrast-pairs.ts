// Single source of truth for the verified pair matrix: golden tests, the verify
// engine, and (later) CI tooling must not drift from each other.
export function contrastPairs(primaryTarget: number): Array<[string, string, number]> {
  return [
    ['--inv-text-primary', '--inv-surface-0', primaryTarget],
    ['--inv-text-primary', '--inv-surface-1', primaryTarget],
    ['--inv-text-primary', '--inv-surface-2', primaryTarget],
    ['--inv-text-secondary', '--inv-surface-0', 4.5],
    ['--inv-text-secondary', '--inv-surface-1', 4.5],
    ['--inv-text-primary', '--inv-accent-subtle', 4.5],
    ['--inv-accent-contrast', '--inv-accent', 4.5],
    ['--inv-accent-contrast', '--inv-accent-hover', 4.5],
    ['--inv-text-disabled', '--inv-surface-1', 3.0],
    ['--inv-ring', '--inv-surface-0', 3.0],
    ['--inv-ring', '--inv-surface-1', 3.0],
    ['--inv-accent', '--inv-surface-0', 3.0],
  ]
}
