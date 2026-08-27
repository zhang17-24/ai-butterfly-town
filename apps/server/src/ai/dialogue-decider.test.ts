import { describe, expect, it } from "vitest";
import type { Npc, Player, WorldSummary } from "@ai-town/shared";
import type { SimulationAIProvider, StructuredDecisionResponse } from "./provider.js";
import { DialogueDecisionService } from "./dialogue-decider.js";

function makeNpc(): Npc {
  return {
    profile: {
      id: "npc_lin_xia",
      name: "林夏",
      age: 31,
      role: "栖岸咖啡馆主理人 / 市集协办人",
      color: "#e9704f",
      personality: "外向热心、责任感强，压力大时容易过度控制局面。",
      motivation: "弥补上次活动取消的失误，并让市集收入缓解咖啡馆经营压力。",
      preferences: ["清晰的计划", "清晨", "兑现承诺"],
      dislikes: ["临时失约", "准备不足", "混乱"],
      traits: { sociability: 88, conscientiousness: 92, curiosity: 58, riskTolerance: 36 },
    },
    state: {
      npcId: "npc_lin_xia",
      locationId: "cafe",
      position: { x: 292, y: 184 },
      currentAction: "整理市集清单",
      actionReason: "开店前先确认今天的准备事项。",
      actionEndsAtMinute: 500,
      hunger: 28,
      energy: 76,
      mood: 68,
      stress: 48,
      social: 34,
    },
  };
}

function makeWorld(): WorldSummary {
  return {
    id: "world_qixi_town",
    name: "栖溪镇",
    description: "现代滨河社区",
    gameMinute: 500,
    version: 12,
    paused: false,
    activeBranchId: "branch-main",
    npcCount: 5,
  };
}

function makePlayer(): Player {
  return { id: "player_demo", userId: "user_demo", worldId: "world_qixi_town", name: "旅人", position: { x: 540, y: 350 } };
}

function stubProvider(completeDialogue: (() => Promise<StructuredDecisionResponse>) | (() => never), enabled = true): SimulationAIProvider {
  return {
    enabled,
    providerName: "openai-compatible-responses",
    model: "test-model",
    completeDecision: async () => { throw new Error("unused"); },
    completeDialogue,
  };
}

describe("DialogueDecisionService", () => {
  const service = (provider: SimulationAIProvider) => new DialogueDecisionService(provider);

  it("uses a real AI reply when the provider is enabled and returns valid output", async () => {
    const provider = stubProvider(async () => ({
      rawText: JSON.stringify({ reply: "市集还要准备补给，你愿意帮忙吗？", intent: "market", memory: "玩家关心市集补给" }),
      raw: null,
      usage: { inputTokens: 40, outputTokens: 20 },
    }));
    const result = await service(provider).decide({ npc: makeNpc(), world: makeWorld(), player: makePlayer(), relationshipSummary: null, recentMemories: [], playerMessage: "市集准备得怎么样？" });
    expect(result.source).toBe("ai");
    expect(result.content).toBe("市集还要准备补给，你愿意帮忙吗？");
    expect(result.intent).toBe("market");
    expect(result.memory).toBe("玩家关心市集补给");
    expect(result.trace).toMatchObject({ role: "DIALOGUE", status: "success", source: "ai", finalActionId: "market" });
  });

  it("falls back to Mock after one repair attempt when the model output is invalid", async () => {
    let calls = 0;
    const provider = stubProvider(async () => {
      calls += 1;
      return calls === 1 ? { rawText: JSON.stringify({ note: "没有 reply" }), raw: null, usage: { inputTokens: 1, outputTokens: 1 } }
        : { rawText: "not json", raw: null, usage: { inputTokens: 1, outputTokens: 1 } };
    });
    const result = await service(provider).decide({ npc: makeNpc(), world: makeWorld(), player: makePlayer(), relationshipSummary: null, recentMemories: [], playerMessage: "你好" });
    expect(result.source).toBe("mock");
    expect(result.trace).toMatchObject({ status: "fallback", source: "mock" });
    expect(result.trace.attempts).toBe(2);
    expect(result.trace.validationErrors.length).toBeGreaterThan(0);
    expect(result.content.length).toBeGreaterThan(0);
  });

  it("falls back to Mock when no key or model is configured", async () => {
    const provider = stubProvider(async () => { throw new Error("AI_NOT_CONFIGURED"); }, false);
    const result = await service(provider).decide({ npc: makeNpc(), world: makeWorld(), player: makePlayer(), relationshipSummary: null, recentMemories: [], playerMessage: "你好" });
    expect(result.source).toBe("mock");
    expect(result.trace.fallbackReason).toBe("AI_KEY_OR_MODEL_MISSING");
  });

  it("falls back to Mock when the provider times out on a real reply", async () => {
    const provider = stubProvider(async () => { throw new Error("AI_TIMEOUT"); });
    const result = await service(provider).decide({ npc: makeNpc(), world: makeWorld(), player: makePlayer(), relationshipSummary: null, recentMemories: [], playerMessage: "你有什么不舒服吗" });
    expect(result.source).toBe("mock");
    expect(result.trace.fallbackReason).toBe("AI_TIMEOUT");
  });
});
