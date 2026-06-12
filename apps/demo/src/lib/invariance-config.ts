import type { InvarianceConfig } from 'invariance'

// Relational constraints only — no palette mode. The compiler guarantees AA at
// every level, so the config just floors contrast and caps accent chroma.
// Exported for use by Providers and the gauntlet page.
export const invarianceConfig: InvarianceConfig = {
  app: 'nebula-demo',
  frontend: {
    design: {
      constraints: {
        contrast: '>= 4.5',
        accent_chroma_max: 0.25,
        font_registry: 'default',
        allowed_modes: ['light', 'dark'],
      },
    },
    pages: { '/': { level: 4 } },
  },
}

// ---------------------------------------------------------------------------
// LLM provider selection (env-driven; default = Anthropic, unchanged behavior)
// ---------------------------------------------------------------------------
//
// Swapping Ollama (local, free) ↔ Claude needs no code change — only env. When
// NEXT_PUBLIC_LLM_PROVIDER is 'openai-compatible' we point every agent role at one
// local model (NEXT_PUBLIC_LLM_MODEL) and the OpenAI-compatible base URL; the
// default (no env) is byte-identical to the prior Anthropic-only wiring.

type LlmStructuredMode = 'json_schema' | 'json_object'

export interface LlmProviderProps {
  apiKey: string
  apiBaseUrl?: string
  llmProvider?: 'openai-compatible'
  oaiStructuredMode?: LlmStructuredMode
  models?: { gatekeeper: string; designer: string; builder: string; slotEdit: string }
}

// Built from NEXT_PUBLIC_* env. exactOptionalPropertyTypes: optional fields are
// only present when the openai-compatible path is selected, so the default props
// object is exactly { apiKey } — identical to before this seam existed.
export function llmProviderProps(): LlmProviderProps {
  const provider = process.env.NEXT_PUBLIC_LLM_PROVIDER
  const anthropicKey = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY ?? ''

  if (provider === 'openai-compatible') {
    const baseUrl = process.env.NEXT_PUBLIC_LLM_BASE_URL ?? 'http://localhost:11434/v1'
    const model = process.env.NEXT_PUBLIC_LLM_MODEL ?? 'qwen2.5'
    const mode: LlmStructuredMode =
      process.env.NEXT_PUBLIC_LLM_STRUCTURED_MODE === 'json_object' ? 'json_object' : 'json_schema'
    return {
      // Ollama ignores the key; keep the anthropic key if set (for a hosted OpenAI
      // proxy) else a dummy so the Bearer header is well-formed.
      apiKey: anthropicKey || 'ollama',
      apiBaseUrl: baseUrl,
      llmProvider: 'openai-compatible',
      oaiStructuredMode: mode,
      models: { gatekeeper: model, designer: model, builder: model, slotEdit: model },
    }
  }

  // Default: Anthropic, exactly as before the provider seam.
  return { apiKey: anthropicKey }
}
