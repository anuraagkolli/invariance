import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import type { InvarianceConfig, ThemeJson } from '../config/types'
import type { SlotRegistration } from '../context/registry'
import { createThemeStore } from '../context/theme-store'
import { createMemoryStorage } from '../storage/memory'
import { runPipeline, type PipelineStage } from './pipeline'

// ---------------------------------------------------------------------------
// Integration test for the full Gatekeeper → Builder → Verify → Apply loop.
// Both agents hit fetch('https://api.anthropic.com/v1/messages'); we stub
// fetch and hand it canned responses so the pipeline exercises real JSON
// parsing, real merging, real verification, and real storage.
// ---------------------------------------------------------------------------

function anthropicResponse(bodyJson: unknown): Response {
  return new Response(
    JSON.stringify({
      content: [{ type: 'text', text: JSON.stringify(bodyJson) }],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function mockFetchSequence(responses: Response[]): ReturnType<typeof vi.fn> {
  const queue = [...responses]
  return vi.fn(async () => {
    const next = queue.shift()
    if (!next) throw new Error('mockFetch: more calls than canned responses')
    return next
  })
}

function baseConfig(): InvarianceConfig {
  return {
    app: 'test',
    frontend: {
      design: {
        colors: { mode: 'palette', palette: ['#1A1A2E', '#1B2A4A', '#FFFFFF'] },
      },
      structure: {
        required_sections: ['sidebar'],
        locked_sections: [],
      },
      pages: { '/': { level: 1, required: ['sidebar'] } },
    },
  }
}

function sidebarSlot(): SlotRegistration {
  return {
    name: 'sidebar',
    level: 1,
    pageName: 'home',
    preserve: false,
    alternativesCount: 0,
    type: 'slot',
    cssVariables: ['--inv-sidebar-bg'],
    description: 'left-hand vertical navigation panel',
    aliases: ['left nav'],
  }
}

describe('runPipeline — integration', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('happy path: Gatekeeper classifies, Builder mutates, Verify passes, storage + themeStore update', async () => {
    const intent = {
      type: 'intent',
      slotName: 'sidebar',
      level: 1,
      description: 'Change sidebar background to dark blue',
      requirements: ['Set --inv-sidebar-bg to #1B2A4A'],
    }
    const mutation = {
      mutation: { theme: { globals: { '--inv-sidebar-bg': '#1B2A4A' } } },
      explanation: 'Changed sidebar background to dark blue',
    }
    const fetchMock = mockFetchSequence([
      anthropicResponse(intent),
      anthropicResponse(mutation),
    ])
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const themeStore = createThemeStore()
    const storage = createMemoryStorage()
    const stages: PipelineStage[] = []

    const result = await runPipeline(
      'make the sidebar dark blue',
      [],
      {
        registry: [sidebarSlot()],
        config: baseConfig(),
        themeStore,
        storageBackend: storage,
        apiKey: 'test-key',
        userId: 'u1',
        appId: 'a1',
      },
      (s) => stages.push(s),
    )

    expect(result).toEqual({
      type: 'success',
      description: 'Changed sidebar background to dark blue',
      slotName: 'sidebar',
    })
    expect(stages).toEqual(['gatekeeper', 'builder', 'verifying', 'applying'])
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // Theme store reflects the merged theme with Builder's mutation applied.
    const stored = themeStore.getTheme()
    expect(stored?.theme?.globals?.['--inv-sidebar-bg']).toBe('#1B2A4A')
    expect(stored?.version).toBe(1)

    // Persistence: storage holds the same theme the store holds.
    const persisted = await storage.loadTheme('u1', 'a1')
    expect(persisted?.theme?.globals?.['--inv-sidebar-bg']).toBe('#1B2A4A')
  })

  it('retries the Builder when the first mutation fails verification, then succeeds', async () => {
    const intent = {
      type: 'intent',
      slotName: 'sidebar',
      level: 1,
      description: 'Change sidebar background to dark blue',
      requirements: ['Set --inv-sidebar-bg to #1B2A4A'],
    }
    // First Builder output uses a color NOT in the palette — verify fails on
    // colorInPalette. Second attempt uses a palette color — verify passes.
    const badMutation = {
      mutation: { theme: { globals: { '--inv-sidebar-bg': '#123456' } } },
      explanation: 'first attempt',
    }
    const goodMutation = {
      mutation: { theme: { globals: { '--inv-sidebar-bg': '#1B2A4A' } } },
      explanation: 'second attempt',
    }
    const fetchMock = mockFetchSequence([
      anthropicResponse(intent),
      anthropicResponse(badMutation),
      anthropicResponse(goodMutation),
    ])
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const themeStore = createThemeStore()
    const storage = createMemoryStorage()
    const stages: PipelineStage[] = []

    const result = await runPipeline(
      'make the sidebar dark blue',
      [],
      {
        registry: [sidebarSlot()],
        config: baseConfig(),
        themeStore,
        storageBackend: storage,
        apiKey: 'test-key',
        userId: 'u1',
        appId: 'a1',
      },
      (s) => stages.push(s),
    )

    expect(result.type).toBe('success')
    expect(stages).toContain('retry')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(themeStore.getTheme()?.theme?.globals?.['--inv-sidebar-bg']).toBe('#1B2A4A')
  })

  it('returns clarification without invoking the Builder or writing storage', async () => {
    const clarification = {
      type: 'clarification',
      message: 'Do you mean the sidebar or the nav bar?',
    }
    const fetchMock = mockFetchSequence([anthropicResponse(clarification)])
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const themeStore = createThemeStore()
    const storage = createMemoryStorage()

    const result = await runPipeline(
      'change the blue thing',
      [],
      {
        registry: [sidebarSlot()],
        config: baseConfig(),
        themeStore,
        storageBackend: storage,
        apiKey: 'test-key',
        userId: 'u1',
        appId: 'a1',
      },
    )

    expect(result).toEqual(clarification)
    expect(fetchMock).toHaveBeenCalledTimes(1) // Builder not called
    expect(themeStore.getTheme()).toBeNull()
    expect(await storage.loadTheme('u1', 'a1')).toBeNull()
  })

  it('gives up with an error after exhausting Builder retries', async () => {
    const intent = {
      type: 'intent',
      slotName: 'sidebar',
      level: 1,
      description: 'dark blue',
      requirements: ['set bg'],
    }
    const badMutation = {
      mutation: { theme: { globals: { '--inv-sidebar-bg': '#123456' } } },
      explanation: 'still wrong',
    }
    // 1 gatekeeper + 3 builder attempts (initial + 2 retries) all invalid.
    const fetchMock = mockFetchSequence([
      anthropicResponse(intent),
      anthropicResponse(badMutation),
      anthropicResponse(badMutation),
      anthropicResponse(badMutation),
    ])
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const themeStore = createThemeStore()
    const storage = createMemoryStorage()

    const result = await runPipeline(
      'make it pink',
      [],
      {
        registry: [sidebarSlot()],
        config: baseConfig(),
        themeStore,
        storageBackend: storage,
        apiKey: 'test-key',
        userId: 'u1',
        appId: 'a1',
      },
    )

    expect(result.type).toBe('error')
    expect(themeStore.getTheme()).toBeNull()
    expect(await storage.loadTheme('u1', 'a1')).toBeNull()
    // 4 total: 1 gatekeeper + 3 builder attempts
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
