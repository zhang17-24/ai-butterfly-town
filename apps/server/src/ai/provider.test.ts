import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider } from "./provider.js";

describe("OpenAI-compatible provider", () => {
  it("uses the Responses structured-output contract and extracts usage", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: "test-model",
        store: false,
        text: { format: { type: "json_schema", name: "npc_decision", strict: true } },
      });
      expect(init?.headers).toMatchObject({ Authorization: "Bearer test-secret" });
      return new Response(JSON.stringify({
        output: [{ content: [{ type: "output_text", text: "{\"actionId\":\"do_work\",\"reason\":\"工作\"}" }] }],
        usage: { input_tokens: 21, output_tokens: 8 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const provider = new OpenAICompatibleProvider({
      apiKey: "test-secret", baseUrl: "https://example.test/v1/", model: "test-model", apiStyle: "responses",
      timeoutMs: 500, maxOutputTokens: 100, maxConcurrency: 1,
    }, fetchImpl as typeof fetch);
    const result = await provider.completeDecision({ instructions: "choose", input: { candidates: [] } });
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/v1/responses", expect.any(Object));
    expect(result).toMatchObject({ rawText: "{\"actionId\":\"do_work\",\"reason\":\"工作\"}", usage: { inputTokens: 21, outputTokens: 8 } });
  });

  it("reports a localized timeout code without exposing the key", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const provider = new OpenAICompatibleProvider({
      apiKey: "never-expose-me", baseUrl: "https://example.test/v1", model: "test-model", apiStyle: "responses",
      timeoutMs: 100, maxOutputTokens: 100, maxConcurrency: 1,
    }, fetchImpl as typeof fetch);
    await expect(provider.completeDecision({ instructions: "choose", input: {} })).rejects.toThrow("AI_TIMEOUT");
  });

  it("uses the dialogue structured-output contract for completeDialogue", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: "test-model",
        store: false,
        text: { format: { type: "json_schema", name: "npc_dialogue", strict: true } },
      });
      return new Response(JSON.stringify({
        output: [{ content: [{ type: "output_text", text: "{\"reply\":\"市集还要准备补给\",\"intent\":\"market\",\"memory\":\"玩家关心市集补给\"}" }] }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const provider = new OpenAICompatibleProvider({
      apiKey: "test-secret", baseUrl: "https://example.test/v1", model: "test-model", apiStyle: "responses",
      timeoutMs: 500, maxOutputTokens: 100, maxConcurrency: 1,
    }, fetchImpl as typeof fetch);
    const result = await provider.completeDialogue({ instructions: "reply", input: { message: "你好" } });
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/v1/responses", expect.any(Object));
    expect(result.rawText).toContain("\"reply\"");
  });

  it("supports the chat/completions style for completeDialogue", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ response_format: { type: "json_object" } });
      return new Response(JSON.stringify({
        choices: [{ message: { content: "{\"reply\":\"好的\"}" } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const provider = new OpenAICompatibleProvider({
      apiKey: "test-secret", baseUrl: "https://example.test/v1", model: "test-model", apiStyle: "chat",
      timeoutMs: 500, maxOutputTokens: 100, maxConcurrency: 1,
    }, fetchImpl as typeof fetch);
    const result = await provider.completeDialogue({ instructions: "reply", input: { message: "你好" } });
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/v1/chat/completions", expect.any(Object));
    expect(result.rawText).toBe("{\"reply\":\"好的\"}");
  });
});
