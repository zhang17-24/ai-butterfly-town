import { randomUUID } from "node:crypto";
import { AiTraceSchema, DecisionOutputSchema, type AiTrace, type DecisionCandidate, type Npc, type WorldBlueprint, type WorldSummary } from "@ai-town/shared";
import { getActionCandidates, type MockAction } from "../domain/mock-decision.js";
import { eventInfluence, type KnownEventSummary } from "../domain/event-influence.js";
import { buildMemoryContextSection } from "../memory/caption.js";
import { computeMemoryRelevanceBonus } from "../memory/mock-decision-bonus.js";
import type { RecalledMemory } from "@ai-town/shared";
import type { SimulationAIProvider } from "./provider.js";

export interface DecisionResult {
  action: MockAction;
  trace: AiTrace;
}

const clampScore = (value: number) => Math.min(200, Math.max(0, value));

export class SimulationDecisionService {
  constructor(private readonly provider: SimulationAIProvider) {}

  async decide(npc: Npc, world: WorldSummary, options: { allowAI?: boolean; knownEvents?: KnownEventSummary[]; recalledMemories?: RecalledMemory[]; blueprint?: WorldBlueprint } = {}): Promise<DecisionResult> {
    const startedAt = Date.now();
    const knownEvents = options.knownEvents ?? [];
    const recalledMemories = options.recalledMemories ?? [];
    const candidates = getActionCandidates(npc, world.gameMinute + 1, world.version + 1, options.blueprint);
    const influence = eventInfluence(npc, knownEvents);
    for (const candidate of candidates) {
      candidate.score += influence.get(candidate.id) ?? 0;
    }
    const memoryBonuses = new Map<string, number>();
    for (const candidate of candidates) {
      const bonus = computeMemoryRelevanceBonus(candidate, recalledMemories);
      if (bonus.bonus > 0) memoryBonuses.set(candidate.id, bonus.bonus);
      candidate.score = clampScore(candidate.score + bonus.bonus);
    }
    const fallback = [...candidates].sort((a, b) => b.score - a.score)[0];
    const causalEventIdsFor = (actionId: string) => knownEvents
      .filter((event) => (eventInfluence(npc, [event]).get(actionId) ?? 0) !== 0)
      .map((event) => event.eventId);
    const context = {
      townTime: formatTime(world.gameMinute + 1),
      knownEvents,
      identity: {
        name: npc.profile.name,
        role: npc.profile.role,
        personality: npc.profile.personality,
        motivation: npc.profile.motivation,
        preferences: npc.profile.preferences,
        dislikes: npc.profile.dislikes,
        traits: npc.profile.traits,
      },
      state: npc.state,
      memoryContext: buildMemoryContextSection(recalledMemories, null),
      recalledMemories: recalledMemories.map((memory) => ({ id: memory.id, kind: memory.kind, content: memory.content, importance: memory.importance, reasons: memory.reasons })),
      causalEventIds: [] as string[],
    };
    const publicCandidates: DecisionCandidate[] = candidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      score: Number(candidate.score.toFixed(2)),
      reason: candidate.reason,
      destinationId: candidate.destination.locationId,
      durationMinutes: candidate.durationMinutes,
    }));
    const validationErrors: string[] = [];
    let attempts = 0;
    let rawOutput: unknown = null;
    let inputTokens = 0;
    let outputTokens = 0;
    const aiAllowed = options.allowAI ?? true;
    let fallbackReason: string | null = !this.provider.enabled
      ? "AI_KEY_OR_MODEL_MISSING"
      : aiAllowed ? null : "AI_TICK_BUDGET_EXHAUSTED";

    if (this.provider.enabled && aiAllowed) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        attempts += 1;
        try {
          const response = await this.provider.completeDecision({
            instructions: "你是小镇居民的决策器。只能从给定候选中选择一个行动。依据人物性格、动机、当前状态、时间与系统给出的可知事件选择；你的回答只能依据这些输入，不得引用输入之外的事实（尤其是你未知的事件）。输出简短、第一人称可解释理由。只输出 JSON 对象：{\"actionId\":\"候选id\",\"reason\":\"理由\"}。",
            input: { npc: context, candidates: publicCandidates },
            repairHint: attempt === 0 ? undefined : validationErrors.at(-1),
          });
          inputTokens += response.usage.inputTokens ?? 0;
          outputTokens += response.usage.outputTokens ?? 0;
          rawOutput = parseJson(response.rawText);
          const parsed = DecisionOutputSchema.safeParse(rawOutput);
          if (!parsed.success) {
            validationErrors.push(`SCHEMA:${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
            continue;
          }
          const selected = candidates.find((candidate) => candidate.id === parsed.data.actionId);
          if (!selected) {
            validationErrors.push(`UNKNOWN_ACTION:${parsed.data.actionId}`);
            continue;
          }
          const action = { ...selected, reason: parsed.data.reason };
          context.causalEventIds = causalEventIdsFor(action.id);
          return { action, trace: AiTraceSchema.parse({
            id: randomUUID(), worldId: world.id, branchId: world.activeBranchId, worldVersion: world.version,
            agentId: npc.profile.id, role: "SIMULATION", status: "success", source: "ai",
            provider: this.provider.providerName, model: this.provider.model, context, candidates: publicCandidates,
            rawOutput, validationErrors, fallbackReason: null, finalActionId: action.id, finalReason: action.reason,
            latencyMs: Date.now() - startedAt, attempts, usage: { inputTokens, outputTokens }, stateChanges: {},
            memoryBonus: Object.fromEntries(memoryBonuses), createdAt: new Date().toISOString(),
          }) };
        } catch (error) {
          fallbackReason = error instanceof Error ? error.message : "AI_REQUEST_FAILED";
          validationErrors.push(fallbackReason);
        }
      }
    }

    attempts = Math.max(1, attempts);
    context.causalEventIds = causalEventIdsFor(fallback.id);
    return { action: fallback, trace: AiTraceSchema.parse({
      id: randomUUID(), worldId: world.id, branchId: world.activeBranchId, worldVersion: world.version,
      agentId: npc.profile.id, role: "SIMULATION", status: "fallback", source: "mock",
      provider: this.provider.providerName, model: this.provider.model, context, candidates: publicCandidates,
      rawOutput, validationErrors, fallbackReason: fallbackReason ?? "AI_OUTPUT_INVALID",
      finalActionId: fallback.id, finalReason: fallback.reason, latencyMs: Date.now() - startedAt, attempts,
      usage: { inputTokens: inputTokens || null, outputTokens: outputTokens || null }, stateChanges: {}, createdAt: new Date().toISOString(),
    }) };
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
