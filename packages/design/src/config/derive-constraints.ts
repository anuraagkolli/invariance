import type { InvarianceConfig } from './types'
import type { DesignConstraints } from '../compiler/style-spec'

// Maps the developer-facing YAML block to the compiler's interface.
// 'default' font_registry means "the whole shipped registry" = no restriction.
export function deriveConstraints(config: InvarianceConfig): DesignConstraints {
  const block = config.frontend?.design?.constraints
  if (!block) return {}
  const out: DesignConstraints = {}
  if (block.contrast) {
    const m = /([\d.]+)\s*$/.exec(block.contrast.trim())
    const n = m ? Number(m[1]) : NaN
    if (!Number.isNaN(n)) out.contrast = n
  }
  if (block.accent_chroma_max !== undefined) out.accent_chroma_max = block.accent_chroma_max
  if (block.locked_tokens) out.locked_tokens = block.locked_tokens
  if (block.allowed_modes) out.allowed_modes = block.allowed_modes
  if (Array.isArray(block.font_registry)) out.font_registry = block.font_registry
  return out
}
