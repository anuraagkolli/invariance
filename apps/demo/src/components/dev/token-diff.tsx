'use client'

import type { TokenDiffEntry } from '../../lib/theme-diff'

// Compact change list for one version: `token: before → after` rows with color
// swatches where the value parses as a color. Fixed-neutral styling on purpose
// (the dashboard must not repaint with user themes).

const COLOR_RE = /^(#|oklch|rgb|hsl)/

function Swatch({ value }: { value: string | null }) {
  if (!value || !COLOR_RE.test(value)) return null
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 shrink-0 rounded-sm ring-1 ring-white/20"
      style={{ backgroundColor: value }}
    />
  )
}

export function TokenDiff({ entries }: { entries: TokenDiffEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-white/40">No token changes (content/layout/component edit).</p>
  }
  return (
    <ul className="flex flex-col gap-1 font-mono text-[11px] leading-relaxed text-white/70">
      {entries.map(({ token, before, after }) => (
        <li key={token} className="flex items-center gap-1.5">
          <span className="text-white/45">{token}:</span>
          <Swatch value={before} />
          <span className="truncate">{before ?? '∅'}</span>
          <span className="text-white/35">→</span>
          <Swatch value={after} />
          <span className="truncate text-white">{after ?? '∅'}</span>
        </li>
      ))}
    </ul>
  )
}
