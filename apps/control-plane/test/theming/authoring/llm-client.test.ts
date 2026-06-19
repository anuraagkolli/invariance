// apps/control-plane/test/theming/llm-client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chatText, resolveModel } from "../../../src/theming/authoring/llm-client.js";

describe("resolveModel", () => {
  beforeEach(() => {
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.INVARIANCE_LLM_PROVIDER;
  });

  it("defaults to qwen via Ollama, never an Anthropic model id", () => {
    const r = resolveModel();
    expect(r.baseUrl).toBe("http://localhost:11434/v1");
    expect(r.model).toBe("qwen2.5:latest");
    expect(r.model.toLowerCase()).not.toContain("claude");
    expect(r.model.toLowerCase()).not.toContain("anthropic");
  });

  it("honors env overrides", () => {
    process.env.OPENAI_BASE_URL = "http://example/v1";
    process.env.OPENAI_MODEL = "qwen2.5:7b";
    process.env.OPENAI_API_KEY = "k";
    const r = resolveModel();
    expect(r.baseUrl).toBe("http://example/v1");
    expect(r.model).toBe("qwen2.5:7b");
    expect(r.apiKey).toBe("k");
  });
});

describe("chatText", () => {
  let calls: Array<{ url: string; init: RequestInit }>;
  beforeEach(() => {
    calls = [];
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_MODEL;
    delete process.env.INVARIANCE_LLM_PROVIDER;
  });
  afterEach(() => vi.restoreAllMocks());

  it("POSTs to the chat/completions endpoint and returns the assistant content", async () => {
    const fetchImpl = vi.fn(async (url: any, init: any) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
      } as any;
    });
    const out = await chatText({
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
      ],
      temperature: 0,
      fetchImpl: fetchImpl as any,
    });
    expect(out).toBe('{"ok":true}');
    expect(calls[0]!.url).toBe("http://localhost:11434/v1/chat/completions");
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.model).toBe("qwen2.5:latest");
    expect(body.temperature).toBe(0);
    expect(body.messages).toHaveLength(2);
  });

  it("throws on a non-ok response", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500, text: async () => "boom" }) as any);
    await expect(
      chatText({ messages: [{ role: "user", content: "x" }], fetchImpl: fetchImpl as any }),
    ).rejects.toThrow(/LLM request failed: 500/);
  });
});
