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
    // 纯 HTTP 部署(如 http://公网IP 直连)下 Secure cookie 会被浏览器拒收:
    // 仅在 x-forwarded-proto: https 或 COOKIE_SECURE=1 时才带 Secure。
    expect(login.headers["set-cookie"]).not.toContain("Secure");

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

  it("sets Secure cookie when HTTPS is forwarded or COOKIE_SECURE is set", async () => {
    const built = await buildApp({ databasePath: ":memory:", tickMs: 60_000, cookieSecret: "test-secret" });
    activeApp = built.app;
    const login = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "demo", password: "town1234" },
      headers: { "x-forwarded-proto": "https" },
    });
    expect(login.statusCode).toBe(200);
    expect(login.headers["set-cookie"]).toContain("Secure");
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

  it("deduplicates identical memory writes within one world day and re-writes after the window", async () => {
    const built = await buildApp({ databasePath: ":memory:", tickMs: 60_000, cookieSecret: "test-secret" });
    activeApp = built.app;
    const row = (worldMinute: number, sourceIdentifier: string) => ({
      worldId: "world_qixi_town", agentId: "npc_lin_xia", kind: "action" as const,
      content: "我完成了：回公寓休息（在apartment）", importance: 40,
      subject: "apartment", worldMinute, sourceIdentifier,
      metadataJson: JSON.stringify({ locationId: "apartment" }),
    });
    built.repository.writeMemory(row(520, "action:qixi:lin:520"));
    built.repository.writeMemory(row(540, "action:qixi:lin:540"));
    built.repository.writeMemory(row(2000, "action:qixi:lin:2000"));
    built.repository.writeMemory(row(2010, "action:qixi:lin:2010"));
    const memories = built.repository.listMemories("world_qixi_town", "npc_lin_xia", { limit: 50 })
      .filter((memory) => memory.content.includes("回公寓休息"));
    // 展示层去重后只剩一条;worldMinute 应为 2000,证明 540/2010(窗口内)未落库而 2000(跨窗口)已落库。
    expect(memories).toHaveLength(1);
    expect(memories[0].worldMinute).toBe(2000);
    const recalled = built.repository.recallMemories("world_qixi_town", "npc_lin_xia", "下一步行动 回公寓休息", { worldTimeMinute: 2010 });
    expect(recalled.filter((item) => item.content.includes("回公寓休息"))).toHaveLength(1);
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

    for (let minute = 0; minute < 7; minute += 1) await built.simulation.tick();

    const causal = await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/causal", headers: { cookie: cookie! } });
    expect(causal.statusCode).toBe(200);
    expect(causal.json().events.some((event: any) => event.type === "factory.event")).toBe(true);
    expect(causal.json().edges.some((edge: any) => edge.from === commit.json().event.id)).toBe(true);
  });

});

describe("memory, snapshot, skip, branch and world generation", () => {
  async function loginAsDemo(built: Awaited<ReturnType<typeof buildApp>>): Promise<string> {
    const login = await built.app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "demo", password: "town1234" } });
    const setCookie = login.headers["set-cookie"];
    return (Array.isArray(setCookie) ? setCookie[0] : setCookie)!.split(";")[0];
  }

  it("writes event memories (W2) on commit and recalls them for dialogue", async () => {
    const built = await buildApp({ databasePath: ":memory:", tickMs: 60_000, cookieSecret: "test-secret" });
    activeApp = built.app;
    const cookie = await loginAsDemo(built);

    const preview = await built.app.inject({
      method: "POST", url: "/api/worlds/world_qixi_town/events/preview", headers: { cookie },
      payload: { text: "暴雨预警发布，河岸市集取消" },
    });
    expect(preview.statusCode).toBe(200);
    const state = await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/state", headers: { cookie } });
    const commit = await built.app.inject({
      method: "POST", url: "/api/worlds/world_qixi_town/events/commit", headers: { cookie },
      payload: { preview: preview.json().preview, expectedVersion: state.json().world.version, idempotencyKey: "memory-test-commit-01" },
    });
    expect(commit.statusCode).toBe(200);
    expect(commit.json().affectedNpcs.length).toBeGreaterThan(0);

    const first = commit.json().affectedNpcs[0];
    const memories = await built.app.inject({
      method: "GET", url: `/api/worlds/world_qixi_town/agents/${first.agentId}/memories`, headers: { cookie },
    });
    expect(memories.statusCode).toBe(200);
    expect(memories.json().length).toBeGreaterThan(0);
    const eventMemory = memories.json().find((memory: any) => memory.kind === "event");
    expect(eventMemory).toBeTruthy();
    expect(eventMemory.importance).toBeGreaterThanOrEqual(40);
    expect(eventMemory.subject).toBeTruthy();
    expect(eventMemory.sourceIdentifier).toContain("event:");
  });

  it("writes periodic snapshots during ticks and rollback via branch", async () => {
    const built = await buildApp({ databasePath: ":memory:", tickMs: 60_000, cookieSecret: "test-secret" });
    activeApp = built.app;
    const cookie = await loginAsDemo(built);
    const first = await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/state", headers: { cookie } });
    const startMinute = first.json().world.gameMinute;
    while (startMinute + 60 - (startMinute % 60) > built.repository.getSimulationState("world_qixi_town")!.world.gameMinute) {
      await built.simulation.tick();
    }
    const snapshots = await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/snapshots", headers: { cookie } });
    expect(snapshots.statusCode).toBe(200);
    expect(snapshots.json().length).toBeGreaterThanOrEqual(2);

    const beforeBranch = await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/state", headers: { cookie } });
    const preMinute = beforeBranch.json().world.gameMinute;
    const branch = await built.app.inject({
      method: "POST", url: "/api/worlds/world_qixi_town/branches", headers: { cookie }, payload: {},
    });
    expect(branch.statusCode).toBe(200);
    expect(branch.json().branch.id).not.toBe("branch_world_qixi_town_main");
    expect(branch.json().world.activeBranchId).toBe(branch.json().branch.id);
    expect(branch.json().world.paused).toBe(true);
    expect(branch.json().world.gameMinute).toBeGreaterThanOrEqual(500);
    expect(branch.json().world.gameMinute).toBeLessThanOrEqual(preMinute);
  });

  it("skips time asynchronously via job and restores pause state", async () => {
    const built = await buildApp({ databasePath: ":memory:", tickMs: 60_000, cookieSecret: "test-secret" });
    activeApp = built.app;
    const cookie = await loginAsDemo(built);
    const before = await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/state", headers: { cookie } });
    const from = before.json().world.gameMinute;
    const skip = await built.app.inject({
      method: "POST", url: "/api/worlds/world_qixi_town/skip", headers: { cookie },
      payload: { targetMinute: from + 45, expectedVersion: before.json().world.version, idempotencyKey: "skip-test-0001" },
    });
    expect(skip.statusCode).toBe(202);
    const jobId = skip.json().id;
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const job = await built.app.inject({ method: "GET", url: `/api/worlds/jobs/${jobId}`, headers: { cookie } });
    expect(job.statusCode).toBe(200);
    expect(job.json().status).toBe("succeeded");
    const after = await built.app.inject({ method: "GET", url: "/api/worlds/world_qixi_town/state", headers: { cookie } });
    expect(after.json().world.gameMinute).toBeGreaterThanOrEqual(from + 40);
    expect(after.json().world.paused).toBe(false);
  });

  it("creates a generated world from one line and serves its blueprint and map", async () => {
    const built = await buildApp({ databasePath: ":memory:", tickMs: 60_000, cookieSecret: "test-secret" });
    activeApp = built.app;
    const cookie = await loginAsDemo(built);
    const create = await built.app.inject({
      method: "POST", url: "/api/worlds", headers: { cookie },
      payload: { prompt: "一座花田小村，有茶馆、果园和河畔舞台", population: 5, style: "qixi_pixel" },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().kind).toBe("generate_world");
    const jobId = create.json().id;
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const job = await built.app.inject({ method: "GET", url: `/api/worlds/jobs/${jobId}`, headers: { cookie } });
    expect(job.json().status).toBe("succeeded");
    const worldId = job.json().resultJson ? JSON.parse(job.json().resultJson).worldId : null;
    expect(worldId).toBeTruthy();
    const worlds = await built.app.inject({ method: "GET", url: "/api/worlds", headers: { cookie } });
    expect(worlds.json().some((world: any) => world.id === worldId)).toBe(true);
    const blueprint = await built.app.inject({ method: "GET", url: `/api/worlds/${worldId}/blueprint`, headers: { cookie } });
    expect(blueprint.statusCode).toBe(200);
    expect(blueprint.json().blueprint.locations.length).toBeGreaterThanOrEqual(2);
    expect(blueprint.json().hasMapPng).toBe(true);
    const mapImage = await built.app.inject({ method: "GET", url: `/api/worlds/${worldId}/map-image`, headers: { cookie } });
    expect(mapImage.statusCode).toBe(200);
    expect(mapImage.headers["content-type"]).toBe("image/png");

    for (let minute = 0; minute < 12; minute += 1) await built.simulation.tick();
    const generatedState = await built.app.inject({ method: "GET", url: `/api/worlds/${worldId}/state`, headers: { cookie } });
    const canvas = blueprint.json().blueprint.canvas;
    expect(generatedState.json().npcs.every((npc: any) => npc.state.position.x >= 0
      && npc.state.position.x <= canvas.width
      && npc.state.position.y >= 0
      && npc.state.position.y <= canvas.height)).toBe(true);
  });
});
