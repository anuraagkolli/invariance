import type { AnyThemeJson } from 'invariance'

import { createJsonFileStore } from './json-file-store'

// Append-only version history per (appId, userId) timeline — the data source
// for the /dev dashboard. Every saveTheme PUT from the SDK lands here as a new
// entry with provenance (the prompt that produced it) and a timestamp.

export interface ThemeVersionMeta {
  prompt?: string
  source?: string
  description?: string
}

export interface ThemeVersionEntry {
  seq: number
  at: string // ISO timestamp
  theme: AnyThemeJson
  meta?: ThemeVersionMeta
}

interface Timeline {
  appId: string
  userId: string
  nextSeq: number
  entries: ThemeVersionEntry[] // oldest first on disk
}

interface HistoryFile {
  version: 1
  timelines: Record<string, Timeline>
}

// Cap per timeline: ~3-4KB per v2 doc keeps the file well under a megabyte.
// nextSeq is monotonic so seq numbers stay stable identifiers after pruning.
const ENTRIES_CAP = 50

const store = createJsonFileStore<HistoryFile>('theme-history.json', { version: 1, timelines: {} })

const timelineKey = (appId: string, userId: string) => `${appId}:${userId}`

export async function appendVersion(
  userId: string,
  appId: string,
  theme: AnyThemeJson,
  meta?: ThemeVersionMeta,
): Promise<ThemeVersionEntry> {
  let appended: ThemeVersionEntry | undefined
  await store.update((current) => {
    const key = timelineKey(appId, userId)
    const timeline = current.timelines[key] ?? { appId, userId, nextSeq: 1, entries: [] }
    appended = {
      seq: timeline.nextSeq,
      at: new Date().toISOString(),
      theme,
      ...(meta !== undefined ? { meta } : {}),
    }
    const entries = [...timeline.entries, appended].slice(-ENTRIES_CAP)
    return {
      ...current,
      timelines: {
        ...current.timelines,
        [key]: { ...timeline, nextSeq: timeline.nextSeq + 1, entries },
      },
    }
  })
  return appended!
}

export async function latestTheme(userId: string, appId: string): Promise<AnyThemeJson | null> {
  const file = await store.read()
  const entries = file.timelines[timelineKey(appId, userId)]?.entries ?? []
  return entries.length > 0 ? entries[entries.length - 1]!.theme : null
}

// Newest first — the order the dashboard timeline renders.
export async function listVersions(userId: string, appId: string): Promise<ThemeVersionEntry[]> {
  const file = await store.read()
  const entries = file.timelines[timelineKey(appId, userId)]?.entries ?? []
  return [...entries].reverse()
}

export async function listTimelines(): Promise<
  Array<{ userId: string; appId: string; count: number; latestAt: string }>
> {
  const file = await store.read()
  return Object.values(file.timelines)
    .filter((t) => t.entries.length > 0)
    .map((t) => ({
      userId: t.userId,
      appId: t.appId,
      count: t.entries.length,
      latestAt: t.entries[t.entries.length - 1]!.at,
    }))
}
