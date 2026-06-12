'use client'

import type { ThemeVersionEntry } from '../../lib/server/theme-history-store'
import { VersionCard } from './version-card'

// Newest-first list of a user's theme versions. Each card diffs against the
// chronologically PREVIOUS entry — entries[i + 1] in this ordering.

interface VersionTimelineProps {
  entries: ThemeVersionEntry[]
  onRollback: (entry: ThemeVersionEntry) => Promise<void>
}

export function VersionTimeline({ entries, onRollback }: VersionTimelineProps) {
  if (entries.length === 0) {
    return (
      <p className="rounded-xl bg-white/[0.04] p-6 text-sm text-white/50 ring-1 ring-white/10">
        No edits yet. Open the app, type a vibe into the customization panel, and
        every change lands here with the prompt that produced it.
      </p>
    )
  }
  return (
    <ol className="flex flex-col gap-4">
      {entries.map((entry, i) => (
        <li key={entry.seq}>
          <VersionCard
            entry={entry}
            previous={entries[i + 1] ?? null}
            isLatest={i === 0}
            onRollback={onRollback}
          />
        </li>
      ))}
    </ol>
  )
}
