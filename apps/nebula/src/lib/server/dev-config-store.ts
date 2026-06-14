import type { DevConfigOverlay } from '../dev-config'
import { EMPTY_OVERLAY } from '../dev-config'
import { createJsonFileStore } from './json-file-store'

// Persistence for the developer's lock/unlock overlay. Same file-backed store
// as theme history; layout.tsx reads it per request and merges it into the
// config the live app runs under.

interface DevConfigFile {
  version: 1
  overlay: DevConfigOverlay
}

const store = createJsonFileStore<DevConfigFile>('dev-config.json', { version: 1, overlay: EMPTY_OVERLAY })

export async function readDevConfig(): Promise<DevConfigOverlay> {
  return (await store.read()).overlay
}

// Shape-validates field by field; anything malformed is dropped rather than
// rejected wholesale, so a stale client can never wedge the store.
export async function writeDevConfig(raw: unknown): Promise<DevConfigOverlay> {
  const overlay = sanitizeOverlay(raw)
  await store.update((current) => ({ ...current, overlay }))
  return overlay
}

export function sanitizeOverlay(raw: unknown): DevConfigOverlay {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY_OVERLAY
  const o = raw as Record<string, unknown>
  const overlay: DevConfigOverlay = {}

  if (o.pageLevels && typeof o.pageLevels === 'object' && !Array.isArray(o.pageLevels)) {
    const pageLevels: Record<string, number> = {}
    for (const [route, level] of Object.entries(o.pageLevels as Record<string, unknown>)) {
      if (typeof level === 'number' && Number.isFinite(level)) pageLevels[route] = level
    }
    if (Object.keys(pageLevels).length > 0) overlay.pageLevels = pageLevels
  }

  if (typeof o.accentLock === 'string' && /^#[0-9a-f]{6}$/i.test(o.accentLock)) {
    overlay.accentLock = o.accentLock
  }

  if (Array.isArray(o.lockedSections)) {
    const sections = o.lockedSections.filter((s): s is string => typeof s === 'string')
    if (sections.length > 0) overlay.lockedSections = sections
  }

  if (typeof o.chromaCap === 'number' && Number.isFinite(o.chromaCap)) {
    overlay.chromaCap = Math.max(0.1, Math.min(0.25, o.chromaCap))
  }

  if (typeof o.contrastFloor === 'number' && Number.isFinite(o.contrastFloor)) {
    // The UI emits exactly 4.5 (AA) or 7 (AAA); snap to that two-step set.
    overlay.contrastFloor = o.contrastFloor >= 7 ? 7 : 4.5
  }

  return overlay
}
