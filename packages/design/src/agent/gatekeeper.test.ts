import { describe, it, expect, vi } from 'vitest'
import { callGatekeeper } from './gatekeeper'
import { buildGatekeeperPrompt } from './gatekeeper-prompt'
import { GATEKEEPER_WIRE_SCHEMA } from './wire-schemas'
import type { SlotRegistration } from '../context/registry'
import type { InvarianceConfig } from '../config/types'

const modelSays = (obj: unknown) => vi.fn().mockResolvedValue({
  ok: true, status: 200,
  json: async () => ({ content: [{ type: 'text', text: JSON.stringify(obj) }], stop_reason: 'end_turn' }),
} as unknown as Response)

// Answers calls in order; the last reply repeats (mirrors pipeline.test.ts).
const modelSaysInOrder = (replies: unknown[]) => {
  let i = 0
  return vi.fn().mockImplementation(async () => ({
    ok: true, status: 200,
    json: async () => ({
      content: [{ type: 'text', text: JSON.stringify(replies[Math.min(i++, replies.length - 1)]) }],
      stop_reason: 'end_turn',
    }),
  })) as unknown as typeof fetch
}

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

  // Weak local models (qwen via Ollama) drop required-per-kind fields the wire
  // dialect cannot enforce. The reply observed live for "make the background a
  // more red color" — SLOT_F1 missing level + description — must be fed back
  // for a retry, not hard-error (same recovery contract as the Designer).
  it('retries a zod-invalid reply with feedback and succeeds (weak local models)', async () => {
    const fetchFn = modelSaysInOrder([
      { kind: 'SLOT_F1', slotName: 'header', requirements: ['set --inv-header-bg to #e53935'] },
      { kind: 'SLOT_F1', slotName: 'sidebar', level: 1, description: 'redder sidebar', requirements: [] },
    ])
    const r = await call(fetchFn)
    expect(r.kind).toBe('SLOT_F1')
    expect(fetchFn).toHaveBeenCalledTimes(2)
    // The retry turn must tell the model what was missing.
    const secondBody = JSON.parse((fetchFn as ReturnType<typeof vi.fn>).mock.calls[1]![1].body as string)
    const retryTurn = JSON.stringify(secondBody.messages)
    expect(retryTurn).toContain('level')
    expect(retryTurn).toContain('description')
  })

  it('errors after the retry budget on persistently invalid replies', async () => {
    const fetchFn = modelSays({ kind: 'SLOT_F1' })   // same bad reply every call
    expect((await call(fetchFn as unknown as typeof fetch)).kind).toBe('ERROR')
    expect(fetchFn).toHaveBeenCalledTimes(3)         // initial + 2 retries
  })

  it('does not retry transport errors (connection wording preserved)', async () => {
    const dead = vi.fn().mockRejectedValue(new Error('net')) as unknown as typeof fetch
    const r = await call(dead)
    expect(r.kind === 'ERROR' && r.message).toBe('Connection error. Please try again.')
    expect(dead).toHaveBeenCalledTimes(1)
  })

  // The model is TOLD the levels but a weak model can ignore them — observed
  // live: qwen applied a SLOT_F1 header edit while every page was level 0.
  // Permissions are ours, deterministically, for every kind — not just THEME.
  it('deterministically REJECTs slot kinds when the page is locked, even if the model approved', async () => {
    const r = await call(modelSays({
      kind: 'SLOT_F1', slotName: 'sidebar', level: 1, description: 'darker sidebar', requirements: [],
    }), lockedConfig)
    expect(r.kind).toBe('REJECT')
  })

  it('deterministically REJECTs kinds above the slot\'s own assigned level', async () => {
    // sidebar is a level-1 slot; F3 (layout) implies level 3.
    const r = await call(modelSays({
      kind: 'F3', slotName: 'sidebar', level: 3, description: 'hide the sidebar', requirements: [],
    }))
    expect(r.kind).toBe('REJECT')
  })

  it('CLARIFYs when the model invents a slot name not in the registry', async () => {
    const r = await call(modelSays({
      kind: 'SLOT_F1', slotName: 'bannerz', level: 1, description: 'x', requirements: [],
    }))
    expect(r.kind).toBe('CLARIFY')
  })

  it('prompt routes page-background/surface color requests to THEME, not a slot', () => {
    const prompt = buildGatekeeperPrompt([slot()], unlockedConfig)
    expect(prompt).toMatch(/background.*THEME|THEME.*background/is)
    expect(prompt.toLowerCase()).toContain('page background')
  })

  it('wire schema obeys the structured-outputs dialect', () => {
    const s = JSON.stringify(GATEKEEPER_WIRE_SCHEMA)
    expect(s).not.toContain('"minimum"')
    expect(s).not.toContain('"maximum"')
    expect(s).not.toContain('"minLength"')
    expect(GATEKEEPER_WIRE_SCHEMA.additionalProperties).toBe(false)
  })
})
