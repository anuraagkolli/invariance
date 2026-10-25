// One place owns the model ids (DESIGN.md 1.9): swap tiers here, nowhere else.
export const GATEKEEPER_MODEL = 'claude-haiku-4-5'
export const DESIGNER_MODEL = 'claude-sonnet-4-6'
export const BUILDER_MODEL = 'claude-sonnet-4-6'
// Slot-edit is a micro-mutation classification job: Haiku latency matters more
// than Sonnet capability here.
export const SLOT_EDIT_MODEL = 'claude-haiku-4-5'

// Local-dev default for the OpenAI-compatible (Ollama) provider. One model serves
// all four roles in local testing; the demo fans this single id out to every role
// via env (NEXT_PUBLIC_LLM_MODEL), bumpable to a larger variant if quality lags.
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5'
