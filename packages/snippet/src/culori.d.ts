// culori v4 ships no .d.ts; this ambient declaration types only the subset the
// snippet calls directly (mini-scan parses computed rgb()/rgba() to hex). The
// clustering math it hands off to lives in core and is typed there. Mirrors the
// shape of core/scanner's culori.d.ts — expand as new culori functions are used.
declare module 'culori' {
  interface Rgb {
    mode: 'rgb'
    r: number
    g: number
    b: number
    alpha?: number
  }

  type AnyColor = Rgb | { mode: string; alpha?: number; [key: string]: unknown }

  export function parse(value: string): AnyColor | undefined
  export function formatHex(color: string | AnyColor): string
}
