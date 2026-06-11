import type { AgentInput, AuthoringAgent } from "./agent";

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-6";

function buildSystemPrompt(input: AgentInput): string {
  const { manifest } = input;
  return `You generate "mod drafts" for the Invariance customization platform: JSON describing UI and API-seam changes for one end user of the app "${manifest.appId}".

Respond with ONLY a JSON object, no prose, of shape:
{
  "uiOps": [
    {"type":"token-override","token":"--inv-x","value":"<css value>"},
    {"type":"style-rule","selector":".cls","declarations":{"prop":"value"}},
    {"type":"slot-override","componentId":"id","slot":"name","content":"<safe html>"}
  ],
  "hooks": [
    {"id":"hook_<name>","trigger":{"endpointId":"<id>","phase":"request"|"response"},
     "language":"js","source":"(payload) => { ...; return payload; }"}
  ],
  "capabilities": {"reads":[{"endpointId":"<id>"}],"writes":[{"endpointId":"<id>","fields":["path"]}],
                   "budgets":{"cpuMs":50,"memMb":32}}
}

Rules:
- Return the user's FULL desired modset: start from the current modset (below) and apply the new request on top. Omitting an existing op removes it.
- Only design tokens, components/slots, and endpoints from the manifest below exist. Never invent ids.
- Hook source must be one synchronous arrow function taking the JSON payload and returning the transformed payload. No imports, no eval, no async, no fetch, no globalThis/process/constructor/__proto__/prototype access.
- Every hook's endpoint must be covered in capabilities. Declare granular write fields.
- Respect every policy. Violations are rejected by a deterministic verifier and you will be asked to repair.

APP MANIFEST:
${JSON.stringify(manifest, null, 2)}

CURRENT MODSET (null if none):
${JSON.stringify(
    input.currentBundle
      ? {
          uiOps: input.currentBundle.uiOps,
          hooks: input.currentBundle.hooks,
          capabilities: input.currentBundle.capabilities,
        }
      : null,
    null,
    2,
  )}`;
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("agent returned no JSON object");
  return JSON.parse(text.slice(start, end + 1));
}

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
    const userContent =
      input.feedback.length > 0
        ? `${input.prompt}\n\nYour previous attempt was rejected by the verifier:\n${input.feedback
            .map((r) => `- ${r}`)
            .join("\n")}\nReturn a corrected full modset.`
        : input.prompt;

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
        messages: [{ role: "user", content: userContent }],
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
