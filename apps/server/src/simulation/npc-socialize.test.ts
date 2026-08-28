import { describe, expect, it } from "vitest";
import type { Npc, NpcState } from "@ai-town/shared";
import { maybeSocialize } from "./npc-socialize.js";

function npc(id: string, locationId: string, actionEndsAtMinute: number): Npc {
  const state: NpcState = {
    npcId: id,
    locationId,
    position: { x: 10, y: 10 },
    currentAction: actionEndsAtMinute <= 0 ? "空闲" : "忙碌",
    actionReason: "test",
    actionEndsAtMinute,
    hunger: 50,
    energy: 50,
    mood: 50,
    stress: 50,
    social: 50,
  };
  return {
    profile: {
      id,
      name: `居民${id.slice(-1)}`,
      age: 30,
      role: "居民",
      color: "#285c43",
      personality: "温和",
      motivation: "安居",
      preferences: [],
      dislikes: [],
      traits: { sociability: 50, conscientiousness: 50, curiosity: 50, riskTolerance: 50 },
    },
    state,
  };
}

const linXia = () => npc("npc_lin_xia", "market", 0);
const doctor = () => npc("npc_shen_zhiheng", "clinic", 0);
const store = () => npc("npc_he_jianguo", "market", 0);

describe("maybeSocialize", () => {
  it("produces a two-line exchange for two idle NPCs in the same location", () => {
    const exchanges = maybeSocialize([linXia(), store()], 100, { rng: () => 0.1, chance: 1 });
    expect(exchanges).toHaveLength(1);
    const [first, second] = exchanges[0];
    expect(first.speakerId).toBe("npc_lin_xia");
    expect(second.speakerId).toBe("npc_he_jianguo");
    expect(first.line.length).toBeGreaterThan(0);
    expect(second.line.length).toBeGreaterThan(0);
  });

  it("skips NPCs whose action has not yet ended (not idle)", () => {
    const exchanges = maybeSocialize([linXia(), store(), doctor(), npc("npc_zhou_fang", "market", 999)], 100, {
      rng: () => 0.1,
      chance: 1,
    });
    // market 空闲组 = [lin_xia, he_jianguo] → 1 组;fang 未空闲被剔除;doctor 在 clinic 不同地。
    expect(exchanges).toHaveLength(1);
    const speakers = new Set(exchanges[0].map((line) => line.speakerId));
    expect(speakers.has("npc_zhou_fang")).toBe(false);
    expect(speakers.has("npc_shen_zhiheng")).toBe(false);
  });

  it("does nothing for groups with fewer than two idle NPCs", () => {
    expect(maybeSocialize([linXia()], 100, { rng: () => 0.1, chance: 1 })).toEqual([]);
  });

  it("respects the chance gate (rng above chance yields nothing)", () => {
    expect(maybeSocialize([linXia(), store()], 100, { rng: () => 0.99, chance: 0.5 })).toEqual([]);
  });

  it("caps the number of exchanges per world per tick", () => {
    const twoLocations = [
      linXia(), store(),                          // market: 2 idle
      doctor(), npc("npc_zhou_fang", "clinic", 0), // clinic: 2 idle
    ];
    const exchanges = maybeSocialize(twoLocations, 100, { rng: () => 0.1, chance: 1, maxExchanges: 1 });
    expect(exchanges).toHaveLength(1);
  });
});
