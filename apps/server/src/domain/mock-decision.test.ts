import { describe, expect, it } from "vitest";
import type { Npc } from "@ai-town/shared";
import { chooseMockAction } from "./mock-decision.js";
import { demoNpcs } from "./seed.js";

describe("chooseMockAction", () => {
  it("is reproducible for the same NPC and world version", () => {
    const npc = demoNpcs[0] as Npc;
    const first = chooseMockAction(npc, 501, 2);
    const second = chooseMockAction(npc, 501, 2);
    expect(second).toEqual(first);
  });

  it("prioritizes food when hunger becomes critical", () => {
    const base = demoNpcs[1] as Npc;
    const npc: Npc = { ...base, state: { ...base.state, hunger: 96, energy: 80, social: 10 } };
    expect(chooseMockAction(npc, 501, 2).label).toContain("吃早餐");
  });

  it("prioritizes rest when energy reaches a dangerous level", () => {
    const base = demoNpcs[1] as Npc;
    const npc: Npc = { ...base, state: { ...base.state, hunger: 20, energy: 3, social: 10 } };
    expect(chooseMockAction(npc, 501, 2).id).toBe("rest_at_home");
  });

  it("uses personality in the explanation and scoring", () => {
    const npc = demoNpcs[2] as Npc;
    const action = chooseMockAction(npc, 501, 2);
    expect(action.reason.length).toBeGreaterThan(10);
    expect(action.score).toBeGreaterThan(0);
  });
});
