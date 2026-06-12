import { mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AnyThemeJson } from 'invariance'

import { appendVersion, latestTheme, listTimelines, listVersions } from './theme-history-store'

const themeWithAccent = (accent: string): AnyThemeJson => ({
  version: 2,
  base_app_version: 'v1',
  theme: { roles: { '--inv-accent': accent }, slots: {} },
})

// Each test gets a fresh data dir; the store resolves INVARIANCE_DATA_DIR per
// read/write, so pointing it at a new tempdir fully isolates state.
beforeEach(async () => {
  process.env.INVARIANCE_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'inv-history-'))
})

describe('theme-history-store', () => {
  it('appends entries with monotonic seq and ISO timestamps', async () => {
    const a = await appendVersion('u', 'app', themeWithAccent('#111111'))
    const b = await appendVersion('u', 'app', themeWithAccent('#222222'))
    expect([a.seq, b.seq]).toEqual([1, 2])
    expect(new Date(a.at).toISOString()).toBe(a.at)
  })

  it('returns the newest theme from latestTheme, null for unknown timelines', async () => {
    await appendVersion('u', 'app', themeWithAccent('#111111'))
    await appendVersion('u', 'app', themeWithAccent('#222222'))
    const latest = await latestTheme('u', 'app')
    expect((latest as { theme: { roles: Record<string, string> } }).theme.roles['--inv-accent']).toBe('#222222')
    expect(await latestTheme('nobody', 'app')).toBeNull()
  })

  it('round-trips meta and lists versions newest first', async () => {
    await appendVersion('u', 'app', themeWithAccent('#111111'), { prompt: 'make it retro', source: 'pipeline' })
    await appendVersion('u', 'app', themeWithAccent('#222222'), { prompt: 'Ocean', source: 'pack' })
    const versions = await listVersions('u', 'app')
    expect(versions.map((v) => v.meta?.prompt)).toEqual(['Ocean', 'make it retro'])
  })

  it('caps a timeline at 50 entries while keeping seq monotonic', async () => {
    for (let i = 1; i <= 55; i++) {
      await appendVersion('u', 'app', themeWithAccent(`#${String(i).padStart(6, '0')}`))
    }
    const versions = await listVersions('u', 'app')
    expect(versions).toHaveLength(50)
    expect(versions[0]!.seq).toBe(55)
    expect(versions[versions.length - 1]!.seq).toBe(6)
  })

  it('separates timelines per user and reports them via listTimelines', async () => {
    await appendVersion('alice', 'app', themeWithAccent('#111111'))
    await appendVersion('bob', 'app', themeWithAccent('#222222'))
    const timelines = await listTimelines()
    expect(timelines.map((t) => t.userId).sort()).toEqual(['alice', 'bob'])
    expect(timelines.every((t) => t.count === 1)).toBe(true)
  })

  it('loses nothing under concurrent appends (writes are queued)', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => appendVersion('u', 'app', themeWithAccent(`#10101${i}`))),
    )
    const versions = await listVersions('u', 'app')
    expect(versions).toHaveLength(10)
    expect(new Set(versions.map((v) => v.seq)).size).toBe(10)
  })
})
