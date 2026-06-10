// culori v4 ships no .d.ts; this ambient declaration satisfies tsc under
// moduleResolution:Node. Only the subset used by the compiler is typed here.
// Expand as new culori functions are called from non-test source files.
declare module 'culori' {
  export interface Oklch {
    mode: 'oklch'
    l: number
    c: number
    h: number | undefined
  }

  type AnyColor = Oklch | { mode: string; [key: string]: unknown }

  export function clampChroma(color: AnyColor, mode: 'oklch'): Oklch
  export function formatHex(color: AnyColor): string
  export function wcagContrast(a: string | AnyColor, b: string | AnyColor): number
  export function converter(mode: string): (color: string | AnyColor) => AnyColor | undefined
}
