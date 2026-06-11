// Structured-outputs wire dialect: NO minimum/maximum/minLength, enum allowed,
// additionalProperties: false required on every object. Bounds that the dialect
// cannot express are enforced by zod after receipt.
export const GATEKEEPER_WIRE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind'],
  properties: {
    kind: { type: 'string', enum: ['THEME', 'SLOT_F1', 'F2', 'F3', 'F4', 'CLARIFY', 'REJECT'] },
    slotName: { type: 'string' },
    level: { type: 'integer' },
    description: { type: 'string' },
    requirements: { type: 'array', items: { type: 'string' } },
    message: { type: 'string' },
  },
} as const

// Relaxed StyleSpec schema for the structured-outputs dialect.
// fontPairing is an enum of registry ids (the one bound the dialect CAN express);
// all other numeric ranges are enforced by StyleSpecSchema (zod) after receipt.
// pairingIds must be the full registry list at call time so the model can only
// pick valid ids — wrong ids would silently compile to the default pairing.
export function styleSpecWireSchema(pairingIds: readonly string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['mode', 'accentHue', 'accentChroma', 'neutralTint', 'neutralTintStrength',
      'contrast', 'fontPairing', 'radius', 'shadow', 'density', 'borderWeight', 'rationale'],
    properties: {
      mode: { type: 'string', enum: ['light', 'dark'] },
      accentHue: { type: 'number' },          // 0-360 enforced by zod after receipt
      accentChroma: { type: 'string', enum: ['muted', 'medium', 'vivid'] },
      secondaryHue: { type: 'number' },
      neutralTint: { type: 'number' },
      neutralTintStrength: { type: 'string', enum: ['none', 'subtle', 'strong'] },
      contrast: { type: 'string', enum: ['soft', 'standard', 'high'] },
      fontPairing: { type: 'string', enum: [...pairingIds] },
      radius: { type: 'string', enum: ['sharp', 'subtle', 'rounded', 'pill'] },
      shadow: { type: 'string', enum: ['flat', 'subtle', 'pronounced', 'hard-offset'] },
      density: { type: 'string', enum: ['compact', 'standard', 'comfortable'] },
      borderWeight: { type: 'string', enum: ['hairline', 'standard', 'heavy'] },
      rationale: { type: 'string' },
    },
  } as const
}
