import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import { buildApp } from "./app.js";
import { RealtimeMessageSchema } from "@ai-town/shared";

let activeApp: FastifyInstance | null = null;
afterEach(async () => {
  if (activeApp) await activeApp.close();
  activeApp = null;
});

describe("day-one vertical slice", () => {
  it("logs in, loads Qixi Town and persists a simulation tick", async () => {
    const built = await buildApp({ databasePath: ":memory:", tickMs: 60_000, cookieSecret: "test-secret" });
    activeApp = built.app;

    const login = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "demo", password: "town1234" },
    });
    expect(login.statusCode).toBe(200);
    const setCookie = login.headers["set-cookie"];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";")[0];
    expect(cookie).toContain("ai_town_session=");

    const worlds = await built.app.inject({ method: "GET", url: "/api/worlds", headers: { cookie: cookie! } });
    expect(worlds.statusCode).toBe(200);
    expect(worlds.json()[0]).toMatchObject({ id: "world_qixi_town", npcCount: 5 });

    const beforeResponse = await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/state", headers: { cookie: cookie! } });
    const before = beforeResponse.json();
    expect(before.npcs).toHaveLength(5);

    await built.simulation.tick();

    const afterResponse = await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/state", headers: { cookie: cookie! } });
    const after = afterResponse.json();
    expect(after.world.gameMinute).toBe(before.world.gameMinute + 1);
    expect(after.world.version).toBe(before.world.version + 1);
    expect(after.recentEvents.length).toBeGreaterThan(0);
    expect(after.recentEvents[0].payload.source).toBe("mock");
    expect(after.world.activeBranchId).toBe("branch_world_qixi_town_main");
    expect(after.recentEvents[0]).toMatchObject({ branchId: after.world.activeBranchId, source: "mock", schemaVersion: 1 });
    expect(built.repository.getSnapshotCount("world_qixi_town")).toBe(1);

    const traces = await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/agents/npc_lin_xia/decisions", headers: { cookie: cookie! } });
    expect(traces.statusCode).toBe(200);
    expect(traces.json()[0]).toMatchObject({ agentId: "npc_lin_xia", source: "mock", status: "fallback", fallbackReason: "AI_KEY_OR_MODEL_MISSING" });
  });

  it("rejects world access without a login cookie", async () => {
    const built = await buildApp({ databasePath: ":memory:", tickMs: 60_000, cookieSecret: "test-secret" });
    activeApp = built.app;
    const response = await built.app.inject({ method: "GET", url: "/api/worlds" });
    expect(response.statusCode).toBe(401);
  });

  it("moves the persisted player through the blueprint grid and rejects blocked targets", async () => {
    const built = await buildApp({ databasePath: ":memory:", tickMs: 60_000, cookieSecret: "test-secret" });
    activeApp = built.app;
    const login = await built.app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "demo", password: "town1234" } });
    const setCookie = login.headers["set-cookie"];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";")[0];
    const before = (await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/state", headers: { cookie: cookie! } })).json();

    const moved = await built.app.inject({
      method: "POST",
      url: "/api/worlds/world_qixi_town/player/move",
      headers: { cookie: cookie! },
      payload: { target: { x: 620, y: 350 }, expectedVersion: before.world.version, idempotencyKey: "player-move-0001" },
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json()).toMatchObject({ player: { position: { x: 620, y: 350 } }, world: { version: before.world.version + 1 }, replayed: false });
    expect(moved.json().path.length).toBeGreaterThan(1);

    const restored = (await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/state", headers: { cookie: cookie! } })).json();
    expect(restored.player.position).toEqual({ x: 620, y: 350 });
    const blocked = await built.app.inject({
      method: "POST",
      url: "/api/worlds/world_qixi_town/player/move",
      headers: { cookie: cookie! },
      payload: { target: { x: 400, y: 500 }, expectedVersion: restored.world.version, idempotencyKey: "player-move-0002" },
    });
    expect(blocked.statusCode).toBe(422);
    expect(blocked.json().error.code).toBe("TARGET_NOT_WALKABLE");
    const unchanged = (await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/state", headers: { cookie: cookie! } })).json();
    expect(unchanged.player.position).toEqual({ x: 620, y: 350 });
    expect(unchanged.world.version).toBe(restored.world.version);
  });

  it("auto-approaches an NPC, persists Mock dialogue, locks the participant and writes memory", async () => {
    const built = await buildApp({ databasePath: ":memory:", tickMs: 60_000, cookieSecret: "test-secret" });
    activeApp = built.app;
    const login = await built.app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "demo", password: "town1234" } });
    const setCookie = login.headers["set-cookie"];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";")[0];
    const before = (await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/state", headers: { cookie: cookie! } })).json();
    const started = await built.app.inject({
      method: "POST", url: "/api/worlds/world_qixi_town/dialogues/start", headers: { cookie: cookie! },
      payload: { npcId: "npc_lin_xia", expectedVersion: before.world.version, idempotencyKey: "dialogue-start-0001" },
    });
    expect(started.statusCode).toBe(200);
    expect(started.json()).toMatchObject({ session: { status: "active", npcId: "npc_lin_xia" }, npc: { state: { currentAction: "与你交谈" } } });
    expect(started.json().path.length).toBeGreaterThan(1);

    const sent = await built.app.inject({
      method: "POST", url: `/api/dialogues/${started.json().session.id}/messages`, headers: { cookie: cookie! },
      payload: { content: "河岸市集准备得怎么样？" },
    });
    expect(sent.statusCode).toBe(200);
    expect(sent.json().session.messages).toHaveLength(2);
    expect(sent.json().reply).toMatchObject({ source: "mock", speakerId: "npc_lin_xia" });
    expect(sent.json().reply.content).toContain("任务");
    expect(sent.json().world.version).toBe(started.json().world.version + 1);
    expect(sent.json().event).toMatchObject({ type: "dialogue.message", source: "mock", payload: { sessionId: started.json().session.id, npcId: "npc_lin_xia" } });
    expect(built.repository.raw.prepare("SELECT COUNT(*) AS count FROM memories WHERE agent_id = ?").get("npc_lin_xia")).toEqual({ count: 1 });
    expect(built.repository.raw.prepare("SELECT COUNT(*) AS count FROM relationships WHERE source_agent_id = ?").get("npc_lin_xia")).toEqual({ count: 1 });
    expect(built.repository.raw.prepare("SELECT COUNT(*) AS count FROM events WHERE type = ? AND source = ?").get("dialogue.message", "mock")).toEqual({ count: 1 });
    expect(built.repository.raw.prepare("SELECT COUNT(*) AS count FROM ai_traces WHERE agent_id = ? AND role = ?").get("npc_lin_xia", "DIALOGUE")).toEqual({ count: 1 });

    await built.simulation.tick();
    const whileTalking = (await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/state", headers: { cookie: cookie! } })).json();
    expect(whileTalking.world.gameMinute).toBe(before.world.gameMinute + 1);
    expect(whileTalking.npcs.find((npc: any) => npc.profile.id === "npc_lin_xia").state.currentAction).toBe("与你交谈");
    const active = await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/dialogues/active", headers: { cookie: cookie! } });
    expect(active.json().messages).toHaveLength(2);

    const ended = await built.app.inject({ method: "POST", url: `/api/dialogues/${started.json().session.id}/end`, headers: { cookie: cookie! } });
    expect(ended.statusCode).toBe(200);
    expect(ended.json()).toMatchObject({ session: { status: "ended" }, npc: { state: { currentAction: "结束交谈" } } });
    const noActive = await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/dialogues/active", headers: { cookie: cookie! } });
    expect(noActive.json()).toBeNull();
  });

  it("commits a versioned pause command once for the same idempotency key", async () => {
    const built = await buildApp({ databasePath: ":memory:", tickMs: 60_000, cookieSecret: "test-secret" });
    activeApp = built.app;
    const login = await built.app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "demo", password: "town1234" } });
    const setCookie = login.headers["set-cookie"];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";")[0];
    const before = (await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/state", headers: { cookie: cookie! } })).json();
    const payload = { paused: true, expectedVersion: before.world.version, idempotencyKey: "pause-command-0001" };

    const first = await built.app.inject({ method: "POST", url: "/api/worlds/world_qixi_town/pause", headers: { cookie: cookie! }, payload });
    const replay = await built.app.inject({ method: "POST", url: "/api/worlds/world_qixi_town/pause", headers: { cookie: cookie! }, payload });
    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().version).toBe(first.json().version);

    const reusedKey = await built.app.inject({
      method: "POST",
      url: "/api/worlds/world_qixi_town/pause",
      headers: { cookie: cookie! },
      payload: { ...payload, paused: false },
    });
    expect(reusedKey.statusCode).toBe(409);
    expect(reusedKey.json().error.code).toBe("IDEMPOTENCY_KEY_REUSED");

    const after = (await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/state", headers: { cookie: cookie! } })).json();
    expect(after.world.version).toBe(before.world.version + 1);
    expect(after.recentEvents.filter((event: { type: string }) => event.type === "world.paused")).toHaveLength(1);

    const stale = await built.app.inject({
      method: "POST",
      url: "/api/worlds/world_qixi_town/pause",
      headers: { cookie: cookie! },
      payload: { paused: false, expectedVersion: before.world.version, idempotencyKey: "pause-command-0002" },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toMatchObject({ code: "WORLD_VERSION_CONFLICT", recoverable: true });
  });

  it("rejects a stale simulation commit without changing state", async () => {
    const built = await buildApp({ databasePath: ":memory:", tickMs: 60_000, cookieSecret: "test-secret" });
    activeApp = built.app;
    const snapshot = built.repository.getSimulationState("world_qixi_town")!;
    const committed = built.repository.commitTick(
      "world_qixi_town",
      snapshot.world.version - 1,
      snapshot.world.gameMinute + 1,
      snapshot.npcs,
      [],
    );
    expect(committed).toBeNull();
    expect(built.repository.getSimulationState("world_qixi_town")!.world).toMatchObject({
      version: snapshot.world.version,
      gameMinute: snapshot.world.gameMinute,
    });
  });

  it("rolls back the complete tick when event serialization fails", async () => {
    const built = await buildApp({ databasePath: ":memory:", tickMs: 60_000, cookieSecret: "test-secret" });
    activeApp = built.app;
    const before = built.repository.getSimulationState("world_qixi_town")!;
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => built.repository.commitTick(
      "world_qixi_town",
      before.world.version,
      before.world.gameMinute + 1,
      before.npcs.map((npc) => ({ ...npc, state: { ...npc.state, hunger: 100 } })),
      [{
        worldId: "world_qixi_town",
        gameMinute: before.world.gameMinute + 1,
        type: "test.invalid_payload",
        actorId: null,
        summary: "这个事件无法序列化",
        payload: circular,
      }],
    )).toThrow();
    const after = built.repository.getSimulationState("world_qixi_town")!;
    expect(after.world).toMatchObject({ version: before.world.version, gameMinute: before.world.gameMinute });
    expect(after.npcs.map((npc) => npc.state.hunger)).toEqual(before.npcs.map((npc) => npc.state.hunger));
  });

  it("resumes a websocket projection from the requested version", async () => {
    const built = await buildApp({ databasePath: ":memory:", tickMs: 60_000, cookieSecret: "test-secret" });
    activeApp = built.app;
    await built.app.listen({ host: "127.0.0.1", port: 0 });
    const login = await built.app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "demo", password: "town1234" } });
    const setCookie = login.headers["set-cookie"];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";")[0];
    const address = built.app.server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address");
    const current = built.repository.getSimulationState("world_qixi_town")!.world;
    const message = await new Promise<unknown>((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws?worldId=world_qixi_town&afterVersion=${current.version}`, { headers: { cookie: cookie! } });
      socket.once("message", (data) => {
        resolve(JSON.parse(String(data)));
        socket.close();
      });
      socket.once("error", reject);
    });
    const parsed = RealtimeMessageSchema.parse(message);
    expect(parsed).toMatchObject({
      type: "world.catchup",
      worldId: "world_qixi_town",
      branchId: "branch_world_qixi_town_main",
      version: current.version,
    });
  });

  it("carries an A* approach path when NPCs decide to move", async () => {
    const built = await buildApp({ databasePath: ":memory:", tickMs: 60_000, cookieSecret: "test-secret" });
    activeApp = built.app;
    const login = await built.app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "demo", password: "town1234" } });
    const cookie = (Array.isArray(login.headers["set-cookie"]) ? login.headers["set-cookie"][0] : login.headers["set-cookie"])?.split(";")[0];
    await built.simulation.tick();
    const state = (await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/state", headers: { cookie: cookie! } })).json();
    const moving = state.npcs.filter((npc: any) => Array.isArray(npc.state.actionPath) && npc.state.actionPath.length > 1);
    expect(moving.length).toBeGreaterThan(0);
  });

  it("previews an event without writing, commits it with knowledge spread and builds a causal graph", async () => {
    const built = await buildApp({ databasePath: ":memory:", tickMs: 60_000, cookieSecret: "test-secret" });
    activeApp = built.app;
    const login = await built.app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "demo", password: "town1234" } });
    const cookie = (Array.isArray(login.headers["set-cookie"]) ? login.headers["set-cookie"][0] : login.headers["set-cookie"])?.split(";")[0];
    const before = (await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/state", headers: { cookie: cookie! } })).json();

    const preview = await built.app.inject({
      method: "POST", url: "/api/worlds/world_qixi_town/events/preview", headers: { cookie: cookie! },
      payload: { text: "暴雨预警，河岸市集可能延期到下周" },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().affectedNpcCount).toBeGreaterThan(0);
    expect(preview.json()).toMatchObject({ confidence: expect.any(Number), preview: { audience: "public" } });

    const afterPreview = (await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/state", headers: { cookie: cookie! } })).json();
    expect(afterPreview.world.version).toBe(before.world.version);
    expect(afterPreview.recentEvents.length).toBe(before.recentEvents.length);

    const commit = await built.app.inject({
      method: "POST", url: "/api/worlds/world_qixi_town/events/commit", headers: { cookie: cookie! },
      payload: { preview: preview.json().preview, expectedVersion: before.world.version, idempotencyKey: "event-commit-0001" },
    });
    expect(commit.statusCode).toBe(200);
    expect(commit.json().event.type).toBe("factory.event");
    expect(commit.json().event.source).toBe("player");
    expect(commit.json().world.version).toBe(before.world.version + 1);
    expect(commit.json().affectedNpcs.length).toBe(preview.json().affectedNpcCount);
    const knowledgeRows = built.repository.raw.prepare("SELECT COUNT(*) AS count FROM knowledge WHERE world_id = ?").get("world_qixi_town") as { count: number };
    expect(knowledgeRows.count).toBe(preview.json().affectedNpcCount);
    const summaries = built.repository.getKnownEventSummaries("world_qixi_town", commit.json().affectedNpcs[0].agentId, 5);
    expect(summaries.length).toBeGreaterThan(0);
    expect(summaries[0].eventId).toBe(commit.json().event.id);

    const replay = await built.app.inject({
      method: "POST", url: "/api/worlds/world_qixi_town/events/commit", headers: { cookie: cookie! },
      payload: { preview: preview.json().preview, expectedVersion: before.world.version, idempotencyKey: "event-commit-0001" },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().event.id).toBe(commit.json().event.id);

    const conflict = await built.app.inject({
      method: "POST", url: "/api/worlds/world_qixi_town/events/commit", headers: { cookie: cookie! },
      payload: { preview: preview.json().preview, expectedVersion: before.world.version, idempotencyKey: "event-commit-0002" },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe("WORLD_VERSION_CONFLICT");

    const timeline = await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/timeline?afterVersion=" + before.world.version, headers: { cookie: cookie! } });
    expect(timeline.statusCode).toBe(200);
    expect(timeline.json().at(-1).type).toBe("factory.event");

    const causal = await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/causal", headers: { cookie: cookie! } });
    expect(causal.statusCode).toBe(200);
    expect(causal.json().events.some((event: any) => event.type === "factory.event")).toBe(true);
    expect(causal.json().edges).toEqual([]);
  });

});
