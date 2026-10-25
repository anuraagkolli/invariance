import type { AgentInput, AuthoringAgent } from "./agent";
import { buildSystemPrompt, buildUserContent, extractJson } from "./prompt";

const DEFAULT_MODEL = "qwen2.5-coder:14b";

export interface OpenAiCompatAgentOptions {
  /** e.g. http://localhost:11434/v1 (Ollama), https://openrouter.ai/api/v1 */
  baseUrl?: string;
  model?: string;
  /** Optional — local runtimes like Ollama don't need one. */
  apiKey?: string;
  maxTokens?: number;
}

/**
 * AuthoringAgent over the OpenAI chat-completions wire format, which local
 * and hosted open-model runtimes (Ollama, LM Studio, vLLM, OpenRouter) all
 * speak. Lets the control plane author mods without an Anthropic key.
 */
export class OpenAiCompatAgent implements AuthoringAgent {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly maxTokens: number;

  constructor(options: OpenAiCompatAgentOptions = {}) {
    const baseUrl = options.baseUrl ?? process.env.INVARIANCE_LLM_BASE_URL;
    if (!baseUrl) throw new Error("OpenAiCompatAgent requires INVARIANCE_LLM_BASE_URL");
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = options.model ?? process.env.INVARIANCE_LLM_MODEL ?? DEFAULT_MODEL;
    this.apiKey = options.apiKey ?? process.env.INVARIANCE_LLM_API_KEY;
    this.maxTokens = options.maxTokens ?? 4096;
  }

  async generateDraft(input: AgentInput): Promise<unknown> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt(input) },
          { role: "user", content: buildUserContent(input) },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`llm api error ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as {
      choices: Array<{ message?: { content?: string | null } }>;
    };
    const text = body.choices?.[0]?.message?.content ?? "";
    return extractJson(text);
  }
}
