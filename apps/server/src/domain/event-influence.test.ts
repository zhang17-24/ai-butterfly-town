import { describe, expect, it } from "vitest";
import { eventInfluence, type KnownEventSummary } from "./event-influence.js";
import { demoNpcs } from "./seed.js";

const weather: KnownEventSummary = { eventId: "e1", type: "factory.event", summary: "暴雨预警，市集可能取消", gameMinute: 520 };
const party: KnownEventSummary = { eventId: "e2", type: "factory.event", summary: "河岸市集本周六举行", gameMinute: 530 };

describe("event influence on mock candidates", () => {
  it("gives zero influence when the NPC knows nothing", () => {
    const result = eventInfluence(demoNpcs[0], []);
    expect(result.size).toBe(0);
  });

  it("differentiates by risk tolerance for weather events", () => {
    const cautious = demoNpcs.find((npc) => npc.profile.traits.riskTolerance < 40)!;
    const bold = demoNpcs.find((npc) => npc.profile.traits.riskTolerance > 70)!;
    const cautiousInfluence = eventInfluence(cautious, [weather]);
    const boldInfluence = eventInfluence(bold, [weather]);
    expect((cautiousInfluence.get("rest_at_home") ?? 0)).toBeGreaterThan(0);
    expect((boldInfluence.get("do_work") ?? 0)).toBeGreaterThan((cautiousInfluence.get("do_work") ?? 0));
  });

  it("boosts reporting roles toward work when a weather alert lands", () => {
    const reporter = demoNpcs.find((npc) => npc.profile.role.includes("记者"))!;
    const influence = eventInfluence(reporter, [weather]);
    expect(influence.get("do_work")).toBeGreaterThanOrEqual(4);
  });

  it("punishes riverside walks hard under stormy weather", () => {
    const reporter = demoNpcs.find((npc) => npc.profile.role.includes("记者"))!;
    const influence = eventInfluence(reporter, [weather]);
    expect(influence.get("walk_riverside")).toBeLessThanOrEqual(-8);
    expect(influence.get("socialize_riverside")).toBeLessThanOrEqual(-4);
  });

  it("is deterministic for the same input and clamps within ±8", () => {
    const social = demoNpcs.find((npc) => npc.profile.traits.sociability >= 60)!;
    const first = eventInfluence(social, [party, weather, party, weather]);
    const second = eventInfluence(social, [party, weather, party, weather]);
    expect([...first.entries()]).toEqual([...second.entries()]);
    for (const value of first.values()) expect(Math.abs(value)).toBeLessThanOrEqual(8);
  });
});
