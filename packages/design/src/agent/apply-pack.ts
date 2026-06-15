import type { ThemeJsonV2, InvarianceConfig } from '../config/types'
import { compileTheme, InvalidStyleSpecError } from '../compiler/compile'
import { deriveConstraints } from '../config/derive-constraints'
import { verifyV2 } from '../verify/compiled-tests'
import { ThemeJsonV2Schema } from '../config/schema'
import { THEME_PACKS } from '../registries/theme-packs'
import { loadCurrentV2, persistAndApply, type PipelineIoContext } from './pipeline-io'
import type { PipelineResult } from './pipeline'

// LLM-free one-tap path: a theme pack is a known-good StyleSpec, so it skips the
// Gatekeeper + Designer entirely (no apiKey needed) but still runs through the
// Compiler + verifyV2 + persist sequence the THEME route uses. This is the
// keyless quality-preview path (DESIGN 1.6c): show professional themes before
// the user types a word or even has a key configured.
export async function applyPack(
  packId: string,
  context: PipelineIoContext,
): Promise<PipelineResult> {
  const pack = THEME_PACKS.find((p) => p.id === packId)
  if (!pack) return { type: 'error', message: 'Unknown theme pack.' }

  const constraints = deriveConstraints(context.config)

  // Compile under the app's constraints. A pack disallowed by a locked token,
  // chroma cap, mode, or font registry surfaces as InvalidStyleSpecError — the
  // chips are pre-filtered by availablePacks, so this is the defensive net.
  let compiled: ReturnType<typeof compileTheme>
  try {
    compiled = compileTheme(pack.spec, constraints)
  } catch (err) {
    if (err instanceof InvalidStyleSpecError) {
      return { type: 'error', message: 'This theme pack is not allowed by the app constraints.' }
    }
    throw err
  }

  // Build the v2 candidate exactly like the THEME route: compiler roles on top,
  // carry the user's existing slot literals + content/layout/components sections.
  const currentV2 = await loadCurrentV2(context)
  const candidate: ThemeJsonV2 = {
    version: 2,
    base_app_version: currentV2.base_app_version,
    theme: {
      roles: compiled.roles,
      slots: { ...(currentV2.theme?.slots ?? {}) },
      styleSpec: pack.spec,
    },
  }
  if (currentV2.content !== undefined) candidate.content = currentV2.content
  // A pack is a whole look: if the app declares a structural preset for it
  // (frontend.pack_layouts), apply that pack's layout/components too — so a
  // pack relayouts (e.g. retro → grid rows), not just restyles. The preset wins
  // per page; pages it doesn't touch keep the user's existing structure.
  const preset = context.config.frontend?.pack_layouts?.[packId]
  const layout = mergeSectionPages(currentV2.layout, preset?.layout)
  const components = mergeSectionPages(currentV2.components, preset?.components)
  if (layout) candidate.layout = layout
  if (components) candidate.components = components

  // Safety net: vetted packs should always pass, but the verifier stays the
  // independent gate (same as the THEME route) — never trust the input blindly.
  const verification = verifyV2(candidate, context.config, constraints)
  if (!verification.passed) {
    const failures = verification.results
      .filter((r) => !r.passed)
      .map((r) => `${r.name}: ${r.message}`)
    return { type: 'error', message: `Theme pack failed verification: ${failures.join('; ')}` }
  }

  // Schema-check parity with the THEME route: a failure here is a compiler bug
  // (programmer error), not a constraint violation — throw so it surfaces loudly.
  const schemaCheck = ThemeJsonV2Schema.safeParse(candidate)
  if (!schemaCheck.success) {
    throw new Error(
      `pack compiled to an invalid v2 doc: ${schemaCheck.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    )
  }

  await persistAndApply(context, candidate, { prompt: pack.name, source: 'pack', description: pack.spec.rationale })
  return {
    type: 'success',
    description: pack.spec.rationale,
    ...(compiled.warnings.length > 0 ? { warnings: compiled.warnings } : {}),
    slotName: 'theme',
  }
}

// Merge two page-keyed sections (layout or components): `over`'s pages win,
// pages only in `base` are kept. Returns undefined when neither is present.
function mergeSectionPages<T extends { pages: Record<string, unknown> }>(
  base: T | undefined,
  over: T | undefined,
): T | undefined {
  if (!base && !over) return undefined
  return { ...(over ?? base), pages: { ...(base?.pages ?? {}), ...(over?.pages ?? {}) } } as T
}

// Pure: the packs that compile cleanly under the config's constraints. Drives
// the panel's chip row so a pack a developer's constraints forbid (locked accent
// it would override, disallowed mode, font outside the registry) never shows a
// broken chip. compileTheme already enforces allowed_modes + font_registry, so a
// single try/catch covers every constraint dimension.
export function availablePacks(config: InvarianceConfig): Array<{ id: string; name: string }> {
  const constraints = deriveConstraints(config)
  const out: Array<{ id: string; name: string }> = []
  for (const pack of THEME_PACKS) {
    try {
      compileTheme(pack.spec, constraints)
      out.push({ id: pack.id, name: pack.name })
    } catch (err) {
      // Constraint violation = omit the chip. A non-constraint compiler error is
      // a bug, not a config choice — rethrow so it surfaces, never silently hide.
      if (err instanceof InvalidStyleSpecError) continue
      throw err
    }
  }
  return out
}
