'use client'

import { useEffect, useMemo, useState } from 'react'
import { googleFontsUrlFor } from 'invariance'

import type { ThemeVersionEntry } from '../../lib/server/theme-history-store'
import { diffTokenMaps, sectionsChanged, tokenMap } from '../../lib/theme-diff'
import { MiniNebula } from '../mini-nebula'
import { TokenDiff } from './token-diff'

// One entry on the /dev timeline: provenance header, a themed mini-Nebula
// preview (wrapper-scoped --inv-* vars, the /showcase mechanism — so every
// version's theme coexists on one page), the token diff vs the previous
// version, and a rollback action.

const SOURCE_BADGE: Record<string, string> = {
  pipeline: 'bg-sky-500/15 text-sky-300',
  pack: 'bg-violet-500/15 text-violet-300',
  rollback: 'bg-amber-500/15 text-amber-300',
}

interface VersionCardProps {
  entry: ThemeVersionEntry
  previous: ThemeVersionEntry | null
  isLatest: boolean
  onRollback: (entry: ThemeVersionEntry) => Promise<void>
}

export function VersionCard({ entry, previous, isLatest, onRollback }: VersionCardProps) {
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const vars = useMemo(() => tokenMap(entry.theme), [entry.theme])
  const diff = useMemo(
    () => diffTokenMaps(previous?.theme ?? null, entry.theme),
    [previous, entry.theme],
  )
  const sections = useMemo(
    () => sectionsChanged(previous?.theme ?? null, entry.theme),
    [previous, entry.theme],
  )

  // Load this version's display/body faces additively (distinct id prefix so
  // core's single-active-pairing font sweep never removes them).
  const pairing = (entry.theme as { theme?: { styleSpec?: { fontPairing?: string } } }).theme?.styleSpec?.fontPairing
  useEffect(() => {
    if (!pairing) return
    const href = googleFontsUrlFor(pairing)
    if (!href) return
    const linkId = `dev-font-${pairing}`
    if (document.getElementById(linkId)) return
    const link = document.createElement('link')
    link.id = linkId
    link.rel = 'stylesheet'
    link.href = href
    document.head.appendChild(link)
  }, [pairing])

  const source = entry.meta?.source
  // A first entry diffs against nothing — collapse the wall of "added" rows.
  const collapseAsInitial = previous === null && diff.length > 6

  return (
    <article className="flex flex-col gap-3 rounded-xl bg-white/[0.04] p-4 ring-1 ring-white/10">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {entry.meta?.prompt ? `“${entry.meta.prompt}”` : '(no prompt recorded)'}
          </p>
          <p className="mt-0.5 text-xs text-white/50">
            {entry.meta?.description ?? '—'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {source ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SOURCE_BADGE[source] ?? 'bg-white/10 text-white/60'}`}>
              {source}
            </span>
          ) : null}
          <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/70">
            v{entry.seq}
          </span>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
        {/* Theme scope: this version's full token set on the wrapper. */}
        <div style={vars as React.CSSProperties} className="overflow-hidden rounded-lg ring-1 ring-white/10">
          <div className="h-36">
            <MiniNebula />
          </div>
        </div>

        <div className="min-w-0">
          {sections.length > 0 ? (
            <p className="mb-1.5 inline-block rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
              {sections.join(' + ')} changed
            </p>
          ) : null}
          {collapseAsInitial && !showAll ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-xs text-white/50 underline-offset-2 hover:text-white hover:underline"
            >
              {diff.length} tokens set — show all
            </button>
          ) : (
            <TokenDiff entries={diff} />
          )}
        </div>
      </div>

      <footer className="flex items-center justify-between text-xs text-white/40">
        <time dateTime={entry.at}>{new Date(entry.at).toLocaleString()}</time>
        {!isLatest ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void onRollback(entry).finally(() => setBusy(false))
            }}
            className="rounded-md bg-white/10 px-2.5 py-1 font-medium text-white/80 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-40"
          >
            {busy ? 'Rolling back…' : `Roll back to v${entry.seq}`}
          </button>
        ) : (
          <span className="rounded-md bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-300">live</span>
        )}
      </footer>
    </article>
  )
}
