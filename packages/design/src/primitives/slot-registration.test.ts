import { describe, expect, it, vi } from 'vitest'
import { buildSlotRegistration } from './slot'
import { callGatekeeper } from '../agent/gatekeeper'
import type { InvarianceConfig } from '../config/types'

// Regression for the "<slot> is locked … developer allows level 0 here" bug:
// slots registered with an empty pageName made the Gatekeeper resolve
// config.frontend.pages[''] → undefined → level 0, so EVERY slot-scoped change
// was rejected (and a whole-app theme the model misrouted to a slot looked
// non-deterministically broken). A slot must register with its live page.

describe('slot registration carries the live page', () => {
  it('buildSlotRegistration sets pageName to the current page, not a placeholder', () => {
    const reg = buildSlotRegistration('/', { name: 'header', level: 1 })
    expect(reg.pageName).toBe('/')
  })

  it('a slot on an unlocked (level 4) page allows an F1 change through the Gatekeeper', async () => {
    const config: InvarianceConfig = { app: 'demo', frontend: { pages: { '/': { level: 4 } } } }
    const registry = [buildSlotRegistration('/', { name: 'header', level: 4 })]
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              kind: 'SLOT_F1',
              slotName: 'header',
              level: 1,
              description: 'restyle the header',
              requirements: [],
            }),
          },
        ],
        stop_reason: 'end_turn',
      }),
    } as unknown as Response) as unknown as typeof fetch

    const r = await callGatekeeper('restyle the header', [], { registry, config, apiKey: 'k', fetchFn })
    // With pageName='' this rejects with "developer allows level 0 here".
    expect(r.kind).toBe('SLOT_F1')
  })
})
