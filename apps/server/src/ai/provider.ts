export interface StructuredDecisionRequest {
  instructions: string;
  input: Record<string, unknown>;
  repairHint?: string;
}

export interface StructuredDecisionResponse {
  rawText: string;
  raw: unknown;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

export interface SimulationAIProvider {
  readonly enabled: boolean;
  readonly providerName: string;
  readonly model: string;
  completeDecision(request: StructuredDecisionRequest): Promise<StructuredDecisionResponse>;
  completeDialogue(request: StructuredDecisionRequest): Promise<StructuredDecisionResponse>;
}

export interface OpenAICompatibleProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  apiStyle: "responses" | "chat";
  timeoutMs: number;
  maxOutputTokens: number;
  maxConcurrency: number;
}

const decisionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    actionId: { type: "string" },
    reason: { type: "string" },
  },
  required: ["actionId", "reason"],
} as const;

const dialogueJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reply: { type: "string" },
    intent: { type: "string", enum: ["greeting", "chit_chat", "market", "health", "help", "leave", "unknown"] },
    mentionedEntities: { type: "array", items: { type: "string" } },
    memory: { type: "string" },
  },
  required: ["reply"],
} as const;

class Semaphore {
  private active = 0;
  private waiting: Array<() => void> = [];

  constructor(private readonly capacity: number) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.capacity) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active += 1;
    try {
      return await operation();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}

export class OpenAICompatibleProvider implements SimulationAIProvider {
  readonly enabled: boolean;
  readonly providerName: string;
  readonly model: string;
  private semaphore: Semaphore;

  constructor(private readonly config: OpenAICompatibleProviderConfig, private readonly fetchImpl: typeof fetch = fetch) {
    this.enabled = Boolean(config.apiKey && config.model);
    this.model = config.model || "mock";
    this.providerName = config.apiStyle === "responses" ? "openai-compatible-responses" : "openai-compatible-chat";
    this.semaphore = new Semaphore(Math.max(1, config.maxConcurrency));
  }

  completeDecision(request: StructuredDecisionRequest): Promise<StructuredDecisionResponse> {
    if (!this.enabled) throw new Error("AI_NOT_CONFIGURED");
    return this.semaphore.run(() => this.request(request, decisionJsonSchema, "npc_decision"));
  }

  completeDialogue(request: StructuredDecisionRequest): Promise<StructuredDecisionResponse> {
    if (!this.enabled) throw new Error("AI_NOT_CONFIGURED");
    return this.semaphore.run(() => this.request(request, dialogueJsonSchema, "npc_dialogue"));
  }

  private async request(request: StructuredDecisionRequest, jsonSchema: object, schemaName: string): Promise<StructuredDecisionResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(100, this.config.timeoutMs));
    const baseUrl = this.config.baseUrl.replace(/\/$/, "");
    const instructions = request.repairHint
      ? `${request.instructions}\n上一次输出未通过校验：${request.repairHint}。请只修正结构或引用。`
      : request.instructions;
    const body = this.config.apiStyle === "responses" ? {
      model: this.config.model,
      instructions,
      input: JSON.stringify(request.input),
      text: {
        format: { type: "json_schema", name: schemaName, strict: true, schema: jsonSchema },
      },
      max_output_tokens: this.config.maxOutputTokens,
      store: false,
    } : {
      model: this.config.model,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: JSON.stringify(request.input) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: schemaName, strict: true, schema: jsonSchema },
      },
      max_tokens: this.config.maxOutputTokens,
    };

    try {
      const response = await this.fetchImpl(`${baseUrl}/${this.config.apiStyle === "responses" ? "responses" : "chat/completions"}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const raw = await response.json().catch(() => null) as any;
      if (!response.ok) throw new Error(`AI_HTTP_${response.status}:${raw?.error?.message ?? "request failed"}`);
      const rawText = this.config.apiStyle === "responses"
        ? extractResponsesText(raw)
        : raw?.choices?.[0]?.message?.content;
      if (typeof rawText !== "string" || !rawText.trim()) throw new Error("AI_EMPTY_OUTPUT");
      return {
        rawText,
        raw,
        usage: {
          inputTokens: numberOrNull(raw?.usage?.input_tokens ?? raw?.usage?.prompt_tokens),
          outputTokens: numberOrNull(raw?.usage?.output_tokens ?? raw?.usage?.completion_tokens),
        },
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error("AI_TIMEOUT");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

function extractResponsesText(raw: any): string | undefined {
  if (typeof raw?.output_text === "string") return raw.output_text;
  for (const item of raw?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return undefined;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}
