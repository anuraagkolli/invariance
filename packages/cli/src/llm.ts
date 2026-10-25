import type { JsonLlm } from "./draft";

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("model returned no JSON object");
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Env-configured model client for CLI drafting, mirroring the control
 * plane's agent selection: INVARIANCE_LLM_BASE_URL (OpenAI-compatible:
 * Ollama, vLLM, OpenRouter, ...) wins, then ANTHROPIC_API_KEY, else null —
 * callers fall back to deterministic behavior.
 */
export function llmFromEnv(env: NodeJS.ProcessEnv = process.env): JsonLlm | null {
  const baseUrl = env.INVARIANCE_LLM_BASE_URL?.replace(/\/$/, "");
  if (baseUrl) {
    const model = env.INVARIANCE_LLM_MODEL ?? "qwen2.5-coder:3b";
    const apiKey = env.INVARIANCE_LLM_API_KEY;
    return async (system, user) => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (apiKey) headers.authorization = `Bearer ${apiKey}`;
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) throw new Error(`llm api error ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as {
        choices: Array<{ message?: { content?: string | null } }>;
      };
      return extractJson(body.choices?.[0]?.message?.content ?? "");
    };
  }

  const anthropicKey = env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const model = env.INVARIANCE_AUTHORING_MODEL ?? "claude-sonnet-4-6";
    return async (system, user) => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!res.ok) throw new Error(`anthropic api error ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as { content: Array<{ type: string; text?: string }> };
      return extractJson(
        body.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join(""),
      );
    };
  }

  return null;
}
