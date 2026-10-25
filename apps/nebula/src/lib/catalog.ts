import { randomUUID } from 'node:crypto'
import { TITLES, type Title } from './titles'

// Streamline-compatible "show" projection (title + maturity are the fields the
// manifest's invariants protect; rating is omitted — Nebula titles have none).
export interface Show {
  id: string
  title: string
  year: number
  genre: string
  maturity: Title['maturity']
  durationMin: number
  synopsis: string
  hue: number
}

export const SHOWS: Show[] = TITLES.map((t) => ({
  id: t.id,
  title: t.title,
  year: t.year,
  genre: t.genre,
  maturity: t.maturity,
  durationMin: t.durationMin,
  synopsis: t.synopsis,
  hue: t.hue,
}))

// The billboard/featured title (the manifest locks `show.title`).
export const FEATURED_ID = 'crimson-archive'

export interface ContinueItem {
  showId: string
  progress: number
}
export const CONTINUE_DEFAULTS: ContinueItem[] = [
  { showId: 'solar-drift', progress: 45 },
  { showId: 'neon-tide', progress: 82 },
  { showId: 'tidal-empire', progress: 15 },
]

export interface WatchlistItem {
  id: string
  showId: string
  note?: string
  priority?: number
  addedAt: string
}

// Per-subject watchlist (module-scoped; persists for the dev server lifetime).
const watchlists = new Map<string, WatchlistItem[]>()
export function listOf(user: string): WatchlistItem[] {
  let list = watchlists.get(user)
  if (!list) {
    list = []
    watchlists.set(user, list)
  }
  return list
}
export function addToWatchlist(
  user: string,
  input: { showId?: string; note?: string; priority?: number },
): { ok: true; item: WatchlistItem } | { ok: false; status: number; error: string } {
  if (!input.showId || !SHOWS.some((s) => s.id === input.showId)) {
    return { ok: false, status: 400, error: 'unknown showId' }
  }
  const list = listOf(user)
  if (list.some((i) => i.showId === input.showId)) {
    return { ok: false, status: 409, error: 'already in list' }
  }
  const item: WatchlistItem = {
    id: randomUUID(),
    showId: input.showId,
    ...(input.note !== undefined ? { note: input.note } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    addedAt: new Date().toISOString(),
  }
  list.push(item)
  return { ok: true, item }
}
export function removeFromWatchlist(user: string, id: string): boolean {
  const list = listOf(user)
  const i = list.findIndex((x) => x.id === id)
  if (i === -1) return false
  list.splice(i, 1)
  return true
}
