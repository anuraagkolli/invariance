import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentInput } from "../src/modules/authoring/agent";
import { OpenAiCompatAgent } from "../src/modules/authoring/openai-compat";

const manifest = {
  appId: "app1",
  version: "1.0.0",
  designTokens: [{ name: "--inv-accent", kind: "color", value: "#7c5cff" }],
  components: [],
  endpoints: [{ id: "list-items", method: "GET", path: "/api/items" }],
  policies: [],
  createdAt: "2026-06-10T00:00:00.000Z",
} as AgentInput["manifest"];

const input: AgentInput = { prompt: "make it teal", manifest, currentBundle: null, feedback: [] };

function chatResponse(content: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("OpenAiCompatAgent", () => {
  it("posts the chat-completions shape and parses the draft JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse('{"uiOps":[]}'));
    vi.stubGlobal("fetch", fetchMock);

    const agent = new OpenAiCompatAgent({ baseUrl: "http://localhost:11434/v1/", model: "m" });
    const draft = await agent.generateDraft(input);

    expect(draft).toEqual({ uiOps: [] });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("m");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain('"--inv-accent"');
    expect(body.messages[1]).toEqual({ role: "user", content: "make it teal" });
    expect(init.headers.authorization).toBeUndefined();
  });

  it("sends a bearer token when an api key is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse("{}"));
    vi.stubGlobal("fetch", fetchMock);

    const agent = new OpenAiCompatAgent({ baseUrl: "http://x/v1", apiKey: "sk-test" });
    await agent.generateDraft(input);

    expect(fetchMock.mock.calls[0]![1].headers.authorization).toBe("Bearer sk-test");
  });

  it("includes verifier feedback in the user turn on repair attempts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse("{}"));
    vi.stubGlobal("fetch", fetchMock);

    const agent = new OpenAiCompatAgent({ baseUrl: "http://x/v1" });
    await agent.generateDraft({ ...input, feedback: ["unknown token --nope"] });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.messages[1].content).toContain("unknown token --nope");
    expect(body.messages[1].content).toContain("rejected by the verifier");
  });

  it("extracts JSON even when the model wraps it in a code fence", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(chatResponse('```json\n{"hooks":[]}\n```'));
    vi.stubGlobal("fetch", fetchMock);

    const agent = new OpenAiCompatAgent({ baseUrl: "http://x/v1" });
    expect(await agent.generateDraft(input)).toEqual({ hooks: [] });
  });

  it("throws on non-2xx responses with the body in the message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("model not found", { status: 404 })));

    const agent = new OpenAiCompatAgent({ baseUrl: "http://x/v1" });
    await expect(agent.generateDraft(input)).rejects.toThrow(/llm api error 404.*model not found/);
  });
});
