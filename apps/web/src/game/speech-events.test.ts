import { describe, expect, it } from "vitest";
import { RealtimeMessageSchema, type TownEvent } from "@ai-town/shared";
import { SPEECH_PLAYER_ACTOR, toSpeechLines } from "./speech-events";

function event(partial: Partial<TownEvent>): TownEvent {
  return {
    id: "e1",
    worldId: "w1",
    branchId: "b1",
    version: 1,
    gameMinute: 100,
    type: "x",
    actorId: null,
    summary: "",
    source: "mock",
    causeIds: [],
    schemaVersion: 1,
    payload: {},
    createdAt: "2026-08-28T00:00:00.000Z",
    ...partial,
  };
}

describe("toSpeechLines", () => {
  it("extracts both the player line and the NPC reply from dialogue.message", () => {
    const lines = toSpeechLines(event({
      type: "dialogue.message",
      source: "ai",
      payload: { sessionId: "s1", npcId: "npc_lin_xia", message: "市集还办吗？", reply: "照常办，我会盯着。" },
    }));
    expect(lines).toEqual([
      { actorId: SPEECH_PLAYER_ACTOR, text: "市集还办吗？", source: "player" },
      { actorId: "npc_lin_xia", text: "照常办，我会盯着。", source: "ai" },
    ]);
  });

  it("omits the NPC reply when payload lacks it", () => {
    const lines = toSpeechLines(event({
      type: "dialogue.message",
      payload: { sessionId: "s1", message: "你好" },
    }));
    expect(lines).toEqual([{ actorId: SPEECH_PLAYER_ACTOR, text: "你好", source: "player" }]);
  });

  it("extracts a speaker line from npc.dialogue", () => {
    const lines = toSpeechLines(event({
      type: "npc.dialogue",
      source: "mock",
      payload: { speakerId: "npc_he_jianguo", listenerId: "npc_zhou_fang", line: "货我备得差不多了。" },
    }));
    expect(lines).toEqual([{ actorId: "npc_he_jianguo", text: "货我备得差不多了。", source: "mock" }]);
  });

  it("returns nothing for unrelated event types", () => {
    expect(toSpeechLines(event({ type: "npc.action_started", payload: { actionId: "a" } }))).toEqual([]);
  });

  it("returns nothing for malformed npc.dialogue payloads", () => {
    expect(toSpeechLines(event({ type: "npc.dialogue", payload: { speakerId: "npc_a" } }))).toEqual([]);
  });

  it("accepts a realtime world.tick carrying npc.dialogue events", () => {
    const message = {
      eventId: "ev",
      worldId: "w1",
      branchId: "b1",
      version: 2,
      emittedAt: "2026-08-28T00:00:00.000Z",
      type: "world.tick",
      data: {
        worldId: "w1",
        gameMinute: 101,
        version: 2,
        npcs: [],
        events: [
          event({ type: "npc.dialogue", source: "mock", actorId: "npc_lin_xia", payload: { speakerId: "npc_lin_xia", listenerId: "npc_zhou_fang", line: "这么巧。你那边工序收尾得怎么样了？" } }),
        ],
      },
    };
    const parsed = RealtimeMessageSchema.safeParse(message);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const lines = parsed.data.type === "world.tick" ? parsed.data.data.events.flatMap(toSpeechLines) : [];
      expect(lines).toEqual([{ actorId: "npc_lin_xia", text: "这么巧。你那边工序收尾得怎么样了？", source: "mock" }]);
    }
  });
});
