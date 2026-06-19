// apps/control-plane/src/theming/authoring/llm-client.ts
//
// The ONLY module that touches the network LLM. OpenAI-compatible chat endpoint.
// Default: qwen2.5 via Ollama (http://localhost:11434/v1). Anthropic is opt-in ONLY via env and is
// NEVER selected by default — keeping the LLM a non-hard-dependency (CLAUDE.md / no-anthropic rule).

export type ChatMessage = { role: "system" | "user"; content: string };

export type ChatOptions = {
  messages: ChatMessage[];
  temperature?: number;
  /** Injectable for tests; defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
};

export type ResolvedModel = { baseUrl: string; model: string; apiKey: string };

const OLLAMA_DEFAULT_BASE = "http://localhost:11434/v1";
const QWEN_DEFAULT_MODEL = "qwen2.5:latest";

export function resolveModel(): ResolvedModel {
  // Default is qwen2.5 via Ollama (the OpenAI-compatible path); the LLM is never a hard dependency.
  // To point at any other OpenAI-compatible endpoint (incl. an Anthropic-compatible proxy), override
  // OPENAI_BASE_URL / OPENAI_MODEL / OPENAI_API_KEY — no Anthropic model id is ever the default.
  const baseUrl = process.env.OPENAI_BASE_URL ?? OLLAMA_DEFAULT_BASE;
  const model = process.env.OPENAI_MODEL ?? QWEN_DEFAULT_MODEL;
  const apiKey = process.env.OPENAI_API_KEY ?? "ollama"; // Ollama ignores the key but the SDK shape wants one
  return { baseUrl, model, apiKey };
}

export async function chatText(opts: ChatOptions): Promise<string> {
  const { baseUrl, model, apiKey } = resolveModel();
  const doFetch = opts.fetchImpl ?? globalThis.fetch;
  const res = await doFetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: opts.temperature ?? 0,
      messages: opts.messages,
    }),
  });
  if (!res.ok) {
    const detail = typeof res.text === "function" ? await res.text() : "";
    throw new Error(`LLM request failed: ${res.status} ${detail}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("LLM response missing message content");
  return content;
}
