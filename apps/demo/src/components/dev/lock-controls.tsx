'use client'

import { useEffect, useState } from 'react'

import type { DevConfigOverlay } from '../../lib/dev-config'

// The developer's lock/unlock panel: per-page customization level, brand-accent
// token lock, and locked sections. Saving PUTs the overlay; the caller then
// router.refresh()es so the merged config flows into the live provider —
// active for new edits immediately, other sessions on their next request.

const LEVEL_LABELS = ['0 — locked', '1 — theme/style', '2 — + content', '3 — + layout', '4 — + components']

// m.slot section names on the home screen the developer can pin.
const LOCKABLE_SECTIONS = ['hero', 'row-trending', 'row-continue', 'row-originals', 'row-new', 'row-acclaimed']

interface LockControlsProps {
  overlay: DevConfigOverlay
  // route → level from the static base config (the unlocked default)
  baseLevels: Record<string, number>
  // the latest stored theme's accent, prefilled so "lock the current brand
  // color" is one click (a conflicting lock drops users' stored themes to base
  // styling on their next load — verify-on-load is the enforcement point)
  currentAccent: string | null
  onSave: (overlay: DevConfigOverlay) => Promise<void>
}

export function LockControls({ overlay, baseLevels, currentAccent, onSave }: LockControlsProps) {
  const [levels, setLevels] = useState<Record<string, number>>({})
  const [accentLocked, setAccentLocked] = useState(false)
  const [accent, setAccent] = useState('#e94560')
  const [sections, setSections] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // Re-seed local state whenever the persisted overlay arrives/changes.
  useEffect(() => {
    setLevels({ ...baseLevels, ...overlay.pageLevels })
    setAccentLocked(typeof overlay.accentLock === 'string')
    setAccent(overlay.accentLock ?? currentAccent ?? '#e94560')
    setSections(overlay.lockedSections ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay, currentAccent])

  async function save() {
    setBusy(true)
    try {
      const next: DevConfigOverlay = {
        pageLevels: levels,
        ...(accentLocked ? { accentLock: accent } : {}),
        ...(sections.length > 0 ? { lockedSections: sections } : {}),
      }
      await onSave(next)
      setSavedAt(Date.now())
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-white/[0.04] p-4 ring-1 ring-white/10">
      <header>
        <h2 className="text-sm font-semibold text-white">Invariants</h2>
        <p className="mt-0.5 text-xs text-white/50">
          What your users may customize. Everything else is guaranteed by the compiler and verifier.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-white/40">Page levels</h3>
        {Object.keys(baseLevels).map((route) => (
          <label key={route} className="flex items-center justify-between gap-3 text-sm text-white/80">
            <span className="font-mono text-xs">{route}</span>
            <select
              value={levels[route] ?? 0}
              onChange={(e) => setLevels((l) => ({ ...l, [route]: Number(e.target.value) }))}
              className="rounded-md border border-white/15 bg-[#15161a] px-2 py-1 text-xs text-white"
            >
              {LEVEL_LABELS.map((label, level) => (
                <option key={level} value={level}>{label}</option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-white/40">Brand lock</h3>
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={accentLocked}
            onChange={(e) => setAccentLocked(e.target.checked)}
            className="accent-emerald-400"
          />
          Lock accent color
          <input
            type="color"
            value={accent}
            disabled={!accentLocked}
            onChange={(e) => setAccent(e.target.value)}
            aria-label="Locked accent color"
            className="h-6 w-9 cursor-pointer rounded border border-white/15 bg-transparent disabled:opacity-30"
          />
          <span className="font-mono text-xs text-white/50">{accentLocked ? accent : 'unlocked'}</span>
        </label>
        <p className="text-[11px] leading-snug text-white/35">
          Themes compile around a locked token; a stored theme that conflicts is
          dropped to base styling on the user's next load.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-white/40">Locked sections</h3>
        <div className="grid grid-cols-2 gap-1.5">
          {LOCKABLE_SECTIONS.map((name) => (
            <label key={name} className="flex items-center gap-2 text-xs text-white/70">
              <input
                type="checkbox"
                checked={sections.includes(name)}
                onChange={(e) =>
                  setSections((s) => (e.target.checked ? [...s, name] : s.filter((x) => x !== name)))
                }
                className="accent-emerald-400"
              />
              <span className="font-mono">{name}</span>
            </label>
          ))}
        </div>
      </div>

      <footer className="flex items-center justify-between">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-md bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-emerald-400 disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Apply invariants'}
        </button>
        {savedAt ? (
          <span className="text-[11px] text-white/40">
            Saved — active for new edits now; other sessions on next reload.
          </span>
        ) : null}
      </footer>
    </section>
  )
}
