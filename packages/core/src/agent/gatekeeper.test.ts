import { describe, it, expect, vi } from 'vitest'
import { callGatekeeper } from './gatekeeper'
import { GATEKEEPER_WIRE_SCHEMA } from './wire-schemas'
import type { SlotRegistration } from '../context/registry'
import type { InvarianceConfig } from '../config/types'

const modelSays = (obj: unknown) => vi.fn().mockResolvedValue({
  ok: true, status: 200,
  json: async () => ({ content: [{ type: 'text', text: JSON.stringify(obj) }], stop_reason: 'end_turn' }),
} as unknown as Response)

const slot = (over: Partial<SlotRegistration> = {}): SlotRegistration => ({
  name: 'sidebar', level: 1, pageName: '/dashboard', preserve: false,
  alternativesCount: 0, type: 'slot', cssVariables: ['--inv-sidebar-bg'], ...over,
})

const unlockedConfig: InvarianceConfig = {
  app: 'demo',
  frontend: { pages: { '/dashboard': { level: 4 } } },
}
const lockedConfig: InvarianceConfig = {
  app: 'demo',
  frontend: { pages: { '/dashboard': { level: 0 } } },
}

const call = (fetchFn: typeof fetch, config = unlockedConfig) =>
  callGatekeeper('make it retro', [], { registry: [slot()], config, apiKey: 'k', fetchFn })

describe('callGatekeeper (v6)', () => {
  it('classifies THEME', async () => {
    const r = await call(modelSays({ kind: 'THEME', description: 'retro whole-app restyle' }))
    expect(r).toEqual({ kind: 'THEME', description: 'retro whole-app restyle' })
  })

  it('classifies SLOT_F1 with slot fields', async () => {
    const r = await call(modelSays({
      kind: 'SLOT_F1', slotName: 'sidebar', level: 1,
      description: 'make the sidebar blue', requirements: ['blue background'],
    }))
    expect(r.kind).toBe('SLOT_F1')
    if (r.kind === 'SLOT_F1') expect(r.slotName).toBe('sidebar')
  })

  it('REJECTs THEME when every page is locked (level gate is ours, not the model\'s)', async () => {
    const r = await call(modelSays({ kind: 'THEME', description: 'retro' }), lockedConfig)
    expect(r.kind).toBe('REJECT')
  })

  it('passes CLARIFY and REJECT through', async () => {
    expect((await call(modelSays({ kind: 'CLARIFY', message: 'which area?' }))).kind).toBe('CLARIFY')
    expect((await call(modelSays({ kind: 'REJECT', message: 'locked' }))).kind).toBe('REJECT')
  })

  it('maps malformed model output to ERROR, never throws', async () => {
    expect((await call(modelSays({ kind: 'SLOT_F1' }))).kind).toBe('ERROR')   // missing fields
    expect((await call(modelSays('not even an object'))).kind).toBe('ERROR')
    const dead = vi.fn().mockRejectedValue(new Error('net')) as unknown as typeof fetch
    expect((await call(dead)).kind).toBe('ERROR')
  })

  it('wire schema obeys the structured-outputs dialect', () => {
    const s = JSON.stringify(GATEKEEPER_WIRE_SCHEMA)
    expect(s).not.toContain('"minimum"')
    expect(s).not.toContain('"maximum"')
    expect(s).not.toContain('"minLength"')
    expect(GATEKEEPER_WIRE_SCHEMA.additionalProperties).toBe(false)
  })
})
