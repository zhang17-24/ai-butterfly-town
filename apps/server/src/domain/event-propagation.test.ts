import { describe, expect, it } from "vitest";
import type { Npc } from "@ai-town/shared";
import { qixiBlueprint } from "@ai-town/shared/qixi-blueprint";
import {
  alreadyKnowsFact,
  computeKnowledgeSpread,
  type CausalEventSpec,
} from "./event-propagation.js";
import { demoNpcs } from "./seed.js";

const rainEvent: CausalEventSpec = {
  id: "ev_rain_0800",
  type: "weather_alert",
  summary: "暴雨预警发布,河岸市集可能关闭",
  fact: "气象台发布暴雨橙色预警,预计 08:40 前后降雨,市集可能临时关闭。",
  locationId: "riverside",
  involvedNpcIds: [],
  audience: "local",
  gameMinute: 505,
  source: "player",
};

function npcById(id: string): Npc {
  const npc = demoNpcs.find((item) => item.profile.id === id);
  if (!npc) throw new Error(`missing npc ${id}`);
  return npc;
}

describe("computeKnowledgeSpread", () => {
  it("involved NPC always knows the fact regardless of audience", () => {
    const spec: CausalEventSpec = {
      ...rainEvent,
      audience: "private",
      involvedNpcIds: ["npc_lin_xia"],
    };
    const diffs = computeKnowledgeSpread(spec, demoNpcs);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({
      agentId: "npc_lin_xia",
      via: "involved",
      confidence: 100,
    });
  });

  it("public event reaches every NPC via the public channel", () => {
    const spec: CausalEventSpec = { ...rainEvent, audience: "public" };
    const diffs = computeKnowledgeSpread(spec, demoNpcs);
    expect(diffs).toHaveLength(demoNpcs.length);
    for (const diff of diffs) expect(diff.via).toBe("public");
    for (const diff of diffs) expect(diff.confidence).toBe(95);
  });

  it("local event spreads by location sight, hearing radius, and skips far NPCs", () => {
    const diffs = computeKnowledgeSpread(rainEvent, demoNpcs, qixiBlueprint);
    const byAgent = new Map(diffs.map((diff) => [diff.agentId, diff]));
    expect(byAgent.get("npc_zhou_fang")?.via).toBe("sight"); // 河岸广场内
    expect(byAgent.get("npc_shen_zhiheng")?.via).toBe("hearing"); // 可听半径内
    expect(byAgent.get("npc_tang_yucheng")?.via).toBe("hearing"); // 可听半径内
    expect(byAgent.has("npc_lin_xia")).toBe(false); // 超过可听半径
    expect(byAgent.has("npc_he_jianguo")).toBe(false); // 超过可听半径
    for (const diff of diffs) expect(diff.sourceEventId).toBe(rainEvent.id);
  });

  it("private event reaches only involved NPCs", () => {
    const spec: CausalEventSpec = {
      ...rainEvent,
      audience: "private",
      involvedNpcIds: ["npc_shen_zhiheng", "npc_tang_yucheng"],
    };
    const diffs = computeKnowledgeSpread(spec, demoNpcs);
    expect(new Set(diffs.map((diff) => diff.agentId)).size).toBe(2);
    for (const diff of diffs) expect(diff.via).toBe("involved");
  });

  it("sight confidence rises with curiosity and stays deterministic", () => {
    const spec: CausalEventSpec = { ...rainEvent, audience: "local" };
    const curious: Npc = { ...npcById("npc_zhou_fang"), profile: { ...npcById("npc_zhou_fang").profile, traits: { ...npcById("npc_zhou_fang").profile.traits, curiosity: 96 } } };
    const steady: Npc = { ...npcById("npc_shen_zhiheng"), profile: { ...npcById("npc_shen_zhiheng").profile, traits: { ...npcById("npc_shen_zhiheng").profile.traits, curiosity: 22 } } };
    const first = computeKnowledgeSpread(spec, [steady, curious], qixiBlueprint);
    const second = computeKnowledgeSpread(spec, [steady, curious], qixiBlueprint);
    expect(second).toEqual(first);
    const steadyConf = first.find((d) => d.agentId === "npc_shen_zhiheng")!
      .confidence;
    const curiousConf = first.find((d) => d.agentId === "npc_zhou_fang")!
      .confidence;
    expect(curiousConf).toBeGreaterThan(steadyConf);
    expect(curiousConf).toBe(94.6);
  });

  it("alreadyKnowsFact is idempotent for repeated event submissions", () => {
    const facts = computeKnowledgeSpread(rainEvent, demoNpcs, qixiBlueprint).map((d) => d.fact);
    expect(alreadyKnowsFact(facts, rainEvent.id)).toBe(true);
    expect(alreadyKnowsFact(facts, "ev_other")).toBe(false);
    expect(alreadyKnowsFact([], rainEvent.id)).toBe(false);
  });
});
