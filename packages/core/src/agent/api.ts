export interface ClaudeCallOptions {
  apiKey: string
  model: string
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  temperature: number
  maxTokens: number
  outputSchema?: Record<string, unknown>
  fetchFn?: typeof fetch
}

export type ClaudeCallResult = { ok: true; text: string } | { ok: false; error: string }

interface MessagesResponse {
  content?: Array<{ type: string; text?: string }>
  stop_reason?: string
}

// Raw fetch on purpose (no SDK — core thesis). Never throws: agents and the
// pipeline branch on { ok }, and a thrown transport error must not crash the panel.
export async function callClaude(opts: ClaudeCallOptions): Promise<ClaudeCallResult> {
  const fetchFn = opts.fetchFn ?? fetch
  if (!opts.apiKey) return { ok: false, error: 'Missing API key.' }

  let res: Response
  try {
    res = await fetchFn('https://api.anthropic.com/v1/messages', {
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

  if (data.stop_reason === 'refusal') return { ok: false, error: 'The request was declined. Try rephrasing.' }
  if (data.stop_reason === 'max_tokens') return { ok: false, error: 'Response was truncated. Try a shorter request.' }

  const text = data.content?.find((b) => b.type === 'text')?.text
  if (!text) return { ok: false, error: 'Empty model response. Please try again.' }
  return { ok: true, text }
}
