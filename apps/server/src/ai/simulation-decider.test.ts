import { describe, expect, it, vi } from "vitest";
import type { SimulationAIProvider, StructuredDecisionResponse } from "./provider.js";
import { SimulationDecisionService } from "./simulation-decider.js";
import { demoNpcs } from "../domain/seed.js";
import type { WorldSummary } from "@ai-town/shared";

const world: WorldSummary = {
  id: "world_qixi_town",
  name: "栖溪镇",
  description: "测试世界",
  gameMinute: 500,
  version: 1,
  paused: false,
  activeBranchId: "branch_world_qixi_town_main",
  npcCount: 5,
};

function provider(outputs: Array<StructuredDecisionResponse | Error>, enabled = true): SimulationAIProvider {
  const completeDecision = vi.fn(async () => {
    const next = outputs.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error("missing stub output");
    return next;
  });
  return { enabled, providerName: "test-provider", model: enabled ? "test-model" : "mock", completeDecision };
}

function response(value: unknown): StructuredDecisionResponse {
  return { rawText: JSON.stringify(value), raw: value, usage: { inputTokens: 12, outputTokens: 7 } };
}

describe("simulation AI decision", () => {
  it("selects only a validated candidate and records an AI trace", async () => {
    const decider = new SimulationDecisionService(provider([response({ actionId: "walk_riverside", reason: "我想先去河边观察市集准备。" })]));
    const result = await decider.decide(demoNpcs[4], world);
    expect(result.action).toMatchObject({ id: "walk_riverside", reason: "我想先去河边观察市集准备。" });
    expect(result.trace).toMatchObject({ source: "ai", status: "success", attempts: 1, model: "test-model", finalActionId: "walk_riverside" });
    expect(result.trace.candidates).toHaveLength(5);
    expect(JSON.stringify(result.trace)).not.toContain("apiKey");
  });

  it("repairs an unknown action reference once", async () => {
    const fake = provider([
      response({ actionId: "teleport_to_moon", reason: "去月球" }),
      response({ actionId: "do_work", reason: "我应先完成今天的本职工作。" }),
    ]);
    const result = await new SimulationDecisionService(fake).decide(demoNpcs[0], world);
    expect(result.action.id).toBe("do_work");
    expect(result.trace).toMatchObject({ source: "ai", attempts: 2 });
    expect(result.trace.validationErrors[0]).toBe("UNKNOWN_ACTION:teleport_to_moon");
    expect(vi.mocked(fake.completeDecision).mock.calls[1][0].repairHint).toContain("UNKNOWN_ACTION");
  });

  it("falls back deterministically after two provider failures", async () => {
    const result = await new SimulationDecisionService(provider([new Error("AI_TIMEOUT"), new Error("AI_TIMEOUT")])).decide(demoNpcs[1], world);
    expect(result.trace).toMatchObject({ source: "mock", status: "fallback", attempts: 2, fallbackReason: "AI_TIMEOUT" });
    expect(result.action.id).toBe("do_work");
  });

  it("does not call the provider when key or model is missing", async () => {
    const fake = provider([], false);
    const result = await new SimulationDecisionService(fake).decide(demoNpcs[2], world);
    expect(result.trace).toMatchObject({ source: "mock", fallbackReason: "AI_KEY_OR_MODEL_MISSING", attempts: 1 });
    expect(fake.completeDecision).not.toHaveBeenCalled();
  });

  it("uses Mock without an HTTP call when the per-tick AI budget is exhausted", async () => {
    const fake = provider([response({ actionId: "do_work", reason: "work" })]);
    const result = await new SimulationDecisionService(fake).decide(demoNpcs[3], world, { allowAI: false });
    expect(result.trace).toMatchObject({ source: "mock", fallbackReason: "AI_TICK_BUDGET_EXHAUSTED" });
    expect(fake.completeDecision).not.toHaveBeenCalled();
  });
});
