import type { AgentInput, AuthoringAgent } from "./agent";
import { buildSystemPrompt, buildUserContent, extractJson } from "./prompt";

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-6";

export interface AnthropicAgentOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

export class AnthropicAgent implements AuthoringAgent {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(options: AnthropicAgentOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("AnthropicAgent requires ANTHROPIC_API_KEY");
    this.apiKey = apiKey;
    this.model = options.model ?? process.env.INVARIANCE_AUTHORING_MODEL ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? 4096;
  }

  async generateDraft(input: AgentInput): Promise<unknown> {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        system: buildSystemPrompt(input),
        messages: [{ role: "user", content: buildUserContent(input) }],
      }),
    });
    if (!res.ok) {
      throw new Error(`anthropic api error ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as { content: Array<{ type: string; text?: string }> };
    const text = body.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    return extractJson(text);
  }
}
