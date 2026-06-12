export interface UsageEvent {
  model: string
  inputTokens: number
  outputTokens: number
}
export type UsageHandler = (usage: UsageEvent) => void

// Fallback base URL for the Anthropic API. Override via ClaudeCallOptions.baseUrl
// to point the client at a proxy or hosted authoring endpoint instead.
export const DEFAULT_API_BASE_URL = 'https://api.anthropic.com'

// Fallback base URL for the OpenAI-compatible transport. Ollama serves an
// OpenAI-shaped API at this address; the convention INCLUDES /v1 (we append
// /chat/completions), unlike the Anthropic base which excludes it.
export const DEFAULT_OPENAI_BASE_URL = 'http://localhost:11434/v1'

export interface ClaudeCallOptions {
  apiKey: string
  model: string
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  temperature: number
  maxTokens: number
  outputSchema?: Record<string, unknown>
  fetchFn?: typeof fetch
  // Hostability: point the client at a proxy/authoring endpoint instead of the
  // Anthropic API. Metering-readiness: onUsage reports tokens per call.
  baseUrl?: string
  onUsage?: UsageHandler
  // Transport selection. Default 'anthropic' keeps the existing path byte-identical;
  // 'openai-compatible' targets an OpenAI-shaped server (Ollama for local dev).
  provider?: 'anthropic' | 'openai-compatible'
  // OpenAI path only. 'json_schema' uses native response_format schema enforcement;
  // 'json_object' is the fallback for servers/models that reject json_schema — it
  // asks for a bare JSON object and embeds the schema in the system prompt. The
  // agents' zod revalidation + retry absorb the looser guarantee either way.
  oaiStructuredMode?: 'json_schema' | 'json_object'
}

export type ClaudeCallResult = { ok: true; text: string } | { ok: false; error: string }

interface MessagesResponse {
  content?: Array<{ type: string; text?: string }>
  stop_reason?: string
  usage?: { input_tokens?: number; output_tokens?: number }
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

// Dispatcher: two transports share one neutral options/result type. Default
// 'anthropic' so every existing caller (and the 396 core tests faking the
// Anthropic shape) is byte-identical; the OpenAI-compatible path is additive.
export async function callClaude(opts: ClaudeCallOptions): Promise<ClaudeCallResult> {
  if ((opts.provider ?? 'anthropic') === 'openai-compatible') return callOpenAiCompatible(opts)
  return callAnthropic(opts)
}

// Raw fetch on purpose (no SDK — core thesis). Never throws: agents and the
// pipeline branch on { ok }, and a thrown transport error must not crash the panel.
async function callAnthropic(opts: ClaudeCallOptions): Promise<ClaudeCallResult> {
  const fetchFn = opts.fetchFn ?? fetch
  if (!opts.apiKey) return { ok: false, error: 'Missing API key.' }

  const baseUrl = opts.baseUrl ?? DEFAULT_API_BASE_URL

  let res: Response
  try {
    res = await fetchFn(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
        // the customization panel calls from the browser, as in v5
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        system: opts.system,
        messages: opts.messages,
        ...(opts.outputSchema
          ? { output_config: { format: { type: 'json_schema', schema: opts.outputSchema } } }
          : {}),
      }),
    })
  } catch {
    return { ok: false, error: 'Connection error. Please try again.' }
  }

  if (!res.ok) return { ok: false, error: `API error (${res.status}). Please try again.` }

  let data: MessagesResponse
  try {
    data = (await res.json()) as MessagesResponse
  } catch {
    return { ok: false, error: 'Unreadable API response.' }
  }

  // Report token usage before branching on stop_reason — tokens are spent even
  // on refusal or truncation, so the handler must fire regardless of outcome.
  if (data.usage && opts.onUsage) {
    try {
      opts.onUsage({
        model: opts.model,
        inputTokens: data.usage.input_tokens ?? 0,
        outputTokens: data.usage.output_tokens ?? 0,
      })
    } catch {
      // metering must never break a model call (callClaude never throws)
    }
  }

  if (data.stop_reason === 'refusal') return { ok: false, error: 'The request was declined. Try rephrasing.' }
  if (data.stop_reason === 'max_tokens') return { ok: false, error: 'Response was truncated. Try a shorter request.' }

  const text = data.content?.find((b) => b.type === 'text')?.text
  if (!text) return { ok: false, error: 'Empty model response. Please try again.' }
  return { ok: true, text }
}

// OpenAI-compatible transport (Ollama for local dev). Same never-throws contract
// as the Anthropic path. The base URL convention INCLUDES /v1; we append
// /chat/completions. A missing apiKey is fine — Ollama ignores the bearer, so we
// send a dummy rather than early-returning (unlike Anthropic, which needs a key).
async function callOpenAiCompatible(opts: ClaudeCallOptions): Promise<ClaudeCallResult> {
  const fetchFn = opts.fetchFn ?? fetch
  const baseUrl = opts.baseUrl ?? DEFAULT_OPENAI_BASE_URL
  const mode = opts.oaiStructuredMode ?? 'json_schema'

  // json_object fallback: weaker servers reject native json_schema, so we ask for
  // a bare JSON object and pin the shape by appending the schema to the system
  // prompt. The agents' existing zod revalidation + retry absorb imperfect output.
  const useJsonObject = mode === 'json_object' && opts.outputSchema !== undefined
  const system = useJsonObject
    ? `${opts.system}\n\nRespond with ONLY a JSON object matching this schema (no markdown, no prose):\n${JSON.stringify(opts.outputSchema)}`
    : opts.system

  const messages = [{ role: 'system' as const, content: system }, ...opts.messages]

  const responseFormat = opts.outputSchema
    ? useJsonObject
      ? { type: 'json_object' }
      : { type: 'json_schema', json_schema: { name: 'out', strict: false, schema: opts.outputSchema } }
    : undefined

  let res: Response
  try {
    res = await fetchFn(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Ollama ignores the key; a dummy keeps OpenAI-strict servers happy.
        'Authorization': `Bearer ${opts.apiKey || 'ollama'}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        ...(responseFormat ? { response_format: responseFormat } : {}),
      }),
    })
  } catch {
    return { ok: false, error: 'Connection error. Please try again.' }
  }

  if (!res.ok) return { ok: false, error: `API error (${res.status}). Please try again.` }

  let data: ChatCompletionResponse
  try {
    data = (await res.json()) as ChatCompletionResponse
  } catch {
    return { ok: false, error: 'Unreadable API response.' }
  }

  // Fire usage before error branches — tokens are spent even on truncation/filter.
  if (data.usage && opts.onUsage) {
    try {
      opts.onUsage({
        model: opts.model,
        inputTokens: data.usage.prompt_tokens ?? 0,
        outputTokens: data.usage.completion_tokens ?? 0,
      })
    } catch {
      // metering must never break a model call (callClaude never throws)
    }
  }

  const finish = data.choices?.[0]?.finish_reason
  if (finish === 'length') return { ok: false, error: 'Response was truncated. Try a shorter request.' }
  if (finish === 'content_filter') return { ok: false, error: 'The request was declined. Try rephrasing.' }

  const text = data.choices?.[0]?.message?.content
  if (!text) return { ok: false, error: 'Empty model response. Please try again.' }
  return { ok: true, text }
}
