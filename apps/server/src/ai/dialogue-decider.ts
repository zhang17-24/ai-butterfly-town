import { randomUUID } from "node:crypto";
import { AiTraceSchema, DialogueDecisionOutputSchema, type AiTrace, type DialogueIntent, type Npc, type Player, type RecalledMemory, type WorldSummary } from "@ai-town/shared";
import { createMockDialogueReply } from "../dialogue/mock-dialogue.js";
import { buildMemoryContextSection } from "../memory/caption.js";
import type { SimulationAIProvider } from "./provider.js";

export interface DialogueDecision {
  content: string;
  intent: DialogueIntent;
  source: "ai" | "mock";
  memory: string | null;
  trace: AiTrace;
}

export interface DialogueDecideInput {
  npc: Npc;
  world: WorldSummary;
  player: Player;
  relationshipSummary: string | null;
  recentMemories: string[];
  recalledMemories?: RecalledMemory[];
  playerMessage: string;
}

export class DialogueDecisionService {
  constructor(private readonly provider: SimulationAIProvider) {}

  async decide(input: DialogueDecideInput): Promise<DialogueDecision> {
    const startedAt = Date.now();
    const context = {
      townTime: formatTime(input.world.gameMinute),
      npc: {
        name: input.npc.profile.name,
        role: input.npc.profile.role,
        personality: input.npc.profile.personality,
        motivation: input.npc.profile.motivation,
        preferences: input.npc.profile.preferences,
        dislikes: input.npc.profile.dislikes,
      },
      currentState: input.npc.state,
      playerName: input.player.name,
      relationship: input.relationshipSummary,
      recentMemories: input.recentMemories,
      recalledMemories: input.recalledMemories?.map((memory) => ({ id: memory.id, kind: memory.kind, content: memory.content, importance: memory.importance, reasons: memory.reasons })) ?? [],
      memorySection: buildMemoryContextSection(input.recalledMemories ?? [], { agentId: input.player.id, summary: input.relationshipSummary }),
      playerMessage: input.playerMessage,
    };

    const validationErrors: string[] = [];
    let rawOutput: unknown = null;
    let attempts = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    const aiAllowed = this.provider.enabled;
    let fallbackReason: string | null = !aiAllowed ? "AI_KEY_OR_MODEL_MISSING" : null;

    if (aiAllowed) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        attempts += 1;
        try {
          const response = await this.provider.completeDialogue({
            instructions: "你是小镇居民。以角色第一人称回复玩家，只能依据给定人格、动机、偏好和当前状态组织语言，不得编造不了解的事实。必须输出 reply（不超过400字）、intent，可输出 mentionedEntities 与一段可用于记忆的 memory。语气符合人物性格与当前心情。只输出 JSON 对象：{\"reply\":\"回复内容\",\"intent\":\"greeting|chit_chat|market|health|help|leave|unknown\",\"mentionedEntities\":[\"实体\"],\"memory\":\"记忆摘要\"}。",
            input: context,
            repairHint: attempt === 0 ? undefined : validationErrors.at(-1),
          });
          inputTokens += response.usage.inputTokens ?? 0;
          outputTokens += response.usage.outputTokens ?? 0;
          rawOutput = parseJson(response.rawText);
          const parsed = DialogueDecisionOutputSchema.safeParse(rawOutput);
          if (!parsed.success) {
            validationErrors.push(`SCHEMA:${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
            continue;
          }
          const content = parsed.data.reply.trim();
          if (!content) {
            validationErrors.push("EMPTY_REPLY");
            continue;
          }
          return {
            content,
            intent: parsed.data.intent,
            source: "ai",
            memory: parsed.data.memory ?? null,
            trace: AiTraceSchema.parse({
              id: randomUUID(), worldId: input.world.id, branchId: input.world.activeBranchId, worldVersion: input.world.version,
              agentId: input.npc.profile.id, role: "DIALOGUE", status: "success", source: "ai",
              provider: this.provider.providerName, model: this.provider.model, context, candidates: [],
              rawOutput, validationErrors, fallbackReason: null, finalActionId: parsed.data.intent, finalReason: content,
              latencyMs: Date.now() - startedAt, attempts, usage: { inputTokens, outputTokens },
              stateChanges: {}, createdAt: new Date().toISOString(),
            }),
          };
        } catch (error) {
          fallbackReason = error instanceof Error ? error.message : "AI_REQUEST_FAILED";
          validationErrors.push(fallbackReason);
        }
      }
    }

    attempts = Math.max(1, attempts);
    const mockContent = createMockDialogueReply(input.npc, input.playerMessage, input.recalledMemories ?? []);
    const intent = mockIntent(input.playerMessage);
    return {
      content: mockContent,
      intent,
      source: "mock",
      memory: null,
      trace: AiTraceSchema.parse({
        id: randomUUID(), worldId: input.world.id, branchId: input.world.activeBranchId, worldVersion: input.world.version,
        agentId: input.npc.profile.id, role: "DIALOGUE", status: "fallback", source: "mock",
        provider: this.provider.providerName, model: this.provider.model, context, candidates: [],
        rawOutput, validationErrors, fallbackReason: fallbackReason ?? "AI_OUTPUT_INVALID", finalActionId: intent, finalReason: mockContent,
        latencyMs: Date.now() - startedAt, attempts, usage: { inputTokens: inputTokens || null, outputTokens: outputTokens || null },
        stateChanges: {}, createdAt: new Date().toISOString(),
      }),
    };
  }
}

function parseJson(value: string): unknown {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    return { invalidJson: trimmed.slice(0, 500) };
  }
}

function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function mockIntent(message: string): DialogueIntent {
  if (/你好|嗨|早上好|下午好|在吗/.test(message)) return "greeting";
  if (/走了|再见|下次/.test(message)) return "leave";
  if (/市集|摊位|活动|河岸/.test(message)) return "market";
  if (/身体|健康|不舒服|医生|急救/.test(message)) return "health";
  if (/帮|需要|能不能|可以吗|请求/.test(message)) return "help";
  return "chit_chat";
}
