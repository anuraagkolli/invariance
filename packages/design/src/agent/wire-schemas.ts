import type { LookContext } from './looks'
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

// Slot-edit pick: the model chooses intent, never values. targetVar is an enum
// of the slot's registered variables so an off-list var cannot be emitted.
export function slotEditWireSchema(targetVars: readonly string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['targetVar', 'hue', 'chromaLevel', 'lightness', 'explanation'],
    properties: {
      targetVar: { type: 'string', enum: [...targetVars] },
      hue: { type: 'number' },
      chromaLevel: { type: 'string', enum: ['neutral', 'muted', 'medium', 'vivid'] },
      lightness: { type: 'string', enum: ['much-darker', 'darker', 'same', 'lighter', 'much-lighter'] },
      explanation: { type: 'string' },
    },
  } as const
}

// Relaxed StyleSpec schema for the structured-outputs dialect.
// fontPairing is an enum of registry ids (the one bound the dialect CAN express);
// all other numeric ranges are enforced by StyleSpecSchema (zod) after receipt.
// pairingIds must be the full registry list at call time so the model can only
// pick valid ids — wrong ids would silently compile to the default pairing.
// With a LookContext the Designer may also pick component looks by name (axis
// and id enums; pairs and scopes are re-checked by parseLooks after receipt).
export function styleSpecWireSchema(pairingIds: readonly string[], looks?: LookContext) {
  const base = {
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
      typography: { type: 'string', enum: ['standard', 'display-caps', 'editorial', 'technical'] },
      framing: { type: 'string', enum: ['compact', 'standard', 'spacious'] },
      rationale: { type: 'string' },
    },
  } as const
  if (!looks) return base
  const ids = [...new Set(Object.values(looks.axes).flat())]
  const item = {
    type: 'object',
    additionalProperties: false,
    required: ['axis', 'id'],
    properties: {
      axis: { type: 'string', enum: Object.keys(looks.axes) },
      id: { type: 'string', enum: ids },
      ...(looks.sections.length > 0 ? { section: { type: 'string', enum: looks.sections } } : {}),
      ...(looks.pageAllowed ? { this_page_only: { type: 'boolean' } } : {}),
    },
  }
  return { ...base, properties: { ...base.properties, looks: { type: 'array', items: item } } }
}
