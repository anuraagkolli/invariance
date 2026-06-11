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
