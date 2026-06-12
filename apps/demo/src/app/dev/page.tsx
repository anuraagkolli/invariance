'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { applyAnyTheme, mirrorThemeCookie, useInvariance } from 'invariance'

import type { DevConfigOverlay } from '../../lib/dev-config'
import type { ThemeVersionEntry } from '../../lib/server/theme-history-store'
import { tokenMap } from '../../lib/theme-diff'
import { LockControls } from '../../components/dev/lock-controls'
import { VersionTimeline } from '../../components/dev/version-timeline'
import { invarianceConfig } from '../../lib/invariance-config'

// The developer's side of Invariance: every edit users make, versioned with the
// prompt that produced it, plus the lock/unlock controls that govern what the
// pipeline may change. Fixed-neutral styling on purpose — the dashboard must
// not repaint when a user themes the app.

interface TimelineSummary {
  userId: string
  appId: string
  count: number
  latestAt: string
}

const APP_ID = invarianceConfig.app

const baseLevels: Record<string, number> = Object.fromEntries(
  Object.entries(invarianceConfig.frontend?.pages ?? {}).map(([route, page]) => [route, page.level]),
)

export default function DevPage() {
  const router = useRouter()
  const { themeStore, config, userId: sessionUserId } = useInvariance()

  const [timelines, setTimelines] = useState<TimelineSummary[]>([])
  const [selectedUser, setSelectedUser] = useState(sessionUserId || 'demo-user')
  const [entries, setEntries] = useState<ThemeVersionEntry[]>([])
  const [overlay, setOverlay] = useState<DevConfigOverlay>({})
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (user: string) => {
    try {
      const [historyRes, timelinesRes, overlayRes] = await Promise.all([
        fetch(`/api/themes/history?appId=${encodeURIComponent(APP_ID)}&userId=${encodeURIComponent(user)}`),
        fetch(`/api/themes/history?appId=${encodeURIComponent(APP_ID)}`),
        fetch('/api/dev-config'),
      ])
      const history = (await historyRes.json()) as { entries?: ThemeVersionEntry[] }
      const tl = (await timelinesRes.json()) as { timelines?: TimelineSummary[] }
      setEntries(history.entries ?? [])
      setTimelines(tl.timelines ?? [])
      setOverlay((await overlayRes.json()) as DevConfigOverlay)
      setError(null)
    } catch {
      setError('Could not load the dashboard data. Is the dev server running?')
    }
  }, [])

  useEffect(() => {
    void refresh(selectedUser)
  }, [refresh, selectedUser])

  const currentAccent = useMemo(() => {
    const latest = entries[0]
    return latest ? tokenMap(latest.theme)['--inv-accent'] ?? null : null
  }, [entries])

  async function handleSaveOverlay(next: DevConfigOverlay) {
    await fetch('/api/dev-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    })
    // Re-run the dynamic root layout so the merged config flows into the live
    // provider — the very next prompt obeys the new locks.
    router.refresh()
    await refresh(selectedUser)
  }

  async function handleRollback(entry: ThemeVersionEntry) {
    // Append-only: a rollback is a NEW version whose provenance says so.
    await fetch('/api/themes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: selectedUser,
        appId: APP_ID,
        theme: entry.theme,
        meta: { source: 'rollback', description: `Rollback to v${entry.seq}` },
      }),
    })
    // The provider only loads themes on mount, so apply live here — but only
    // when rolling back the user this browser session belongs to.
    if (selectedUser === sessionUserId) {
      themeStore.setTheme(entry.theme)
      applyAnyTheme(entry.theme, config)
      mirrorThemeCookie(APP_ID, entry.theme)
    }
    await refresh(selectedUser)
  }

  return (
    <main className="min-h-screen bg-[#0a0b0d] px-6 py-10 text-white sm:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header>
          <p className="font-mono text-xs uppercase tracking-[0.34em] text-white/50">
            Invariance · Developer
          </p>
          <h1
            className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl"
            style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
          >
            Nebula — edits &amp; invariants
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-white/60">
            Every change your users make, versioned with the prompt that produced
            it. Lock what they may not touch; the pipeline enforces the rest.
          </p>
        </header>

        {error ? (
          <p className="rounded-xl bg-red-500/10 p-4 text-sm text-red-300 ring-1 ring-red-500/30">{error}</p>
        ) : null}

        <div className="grid items-start gap-6 lg:grid-cols-[320px_1fr]">
          <LockControls
            overlay={overlay}
            baseLevels={baseLevels}
            currentAccent={currentAccent}
            onSave={handleSaveOverlay}
          />

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Version history</h2>
              <label className="flex items-center gap-2 text-xs text-white/50">
                User
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="rounded-md border border-white/15 bg-[#15161a] px-2 py-1 text-xs text-white"
                >
                  {(timelines.length > 0 ? timelines.map((t) => t.userId) : [selectedUser]).map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </label>
            </div>
            <VersionTimeline entries={entries} onRollback={handleRollback} />
          </section>
        </div>
      </div>
    </main>
  )
}
