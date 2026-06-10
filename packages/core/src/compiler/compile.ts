import { z } from 'zod'

import { StyleSpecSchema } from './style-spec'
import type { StyleSpec, DesignConstraints } from './style-spec'
import { assignColorRoles, ROLE_TOKENS } from './roles'
import { nonColorTokens } from './tokens'
import { getFontPairing, DEFAULT_MONO_STACK } from '../registries/font-pairings'

// Schema/constraint violations route to the Designer retry path (phase 3).
// Everything past validation must produce a theme — degraded plus warnings,
// never a throw, never a broken page.
export class InvalidStyleSpecError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(`invalid StyleSpec: ${issues.join('; ')}`)
    this.name = 'InvalidStyleSpecError'
    this.issues = issues
  }
}

export interface CompiledTheme {
  roles: Record<string, string>
  warnings: string[]
}

export function compileTheme(
  spec: StyleSpec,
  constraints: DesignConstraints = {},
): CompiledTheme {
  const parsed = StyleSpecSchema.safeParse(spec)
  if (!parsed.success) {
    throw new InvalidStyleSpecError(
      parsed.error.issues.map((i: z.ZodIssue) => `${i.path.join('.')}: ${i.message}`),
    )
  }
  // Cast to StyleSpec: zod infers `secondaryHue?: number | undefined` but with
  // exactOptionalPropertyTypes the interface says `secondaryHue?: number`.
  // Zod validated the value, so the cast is safe — zod never sets absent optionals
  // to undefined in the output object.
  const validSpec = parsed.data as StyleSpec

  if (constraints.allowed_modes && !constraints.allowed_modes.includes(validSpec.mode)) {
    throw new InvalidStyleSpecError([`mode '${validSpec.mode}' is not allowed`])
  }

  const pairing = getFontPairing(validSpec.fontPairing)
  if (!pairing) {
    throw new InvalidStyleSpecError([`unknown fontPairing '${validSpec.fontPairing}'`])
  }
  if (constraints.font_registry && !constraints.font_registry.includes(pairing.id)) {
    throw new InvalidStyleSpecError([`fontPairing '${pairing.id}' is not in the allowed registry`])
  }

  const locks = constraints.locked_tokens ?? {}
  const color = assignColorRoles(validSpec, locks, constraints.accent_chroma_max)

  const roles: Record<string, string> = {
    ...color.roles,
    '--inv-font-display': pairing.display,
    '--inv-font-body': pairing.body,
    '--inv-font-mono': pairing.mono ?? DEFAULT_MONO_STACK,
    ...nonColorTokens(validSpec),
  }

  // locks win over every computed value, color or not
  for (const [token, value] of Object.entries(locks)) roles[token] = value

  const warnings = [...color.warnings]
  for (const token of ROLE_TOKENS) {
    if (!roles[token]) warnings.push(`missing role token ${token}`)
  }

  return { roles, warnings }
}
