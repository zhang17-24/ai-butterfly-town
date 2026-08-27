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
  });

  it("rejects world access without a login cookie", async () => {
    const built = await buildApp({ databasePath: ":memory:", tickMs: 60_000, cookieSecret: "test-secret" });
    activeApp = built.app;
    const response = await built.app.inject({ method: "GET", url: "/api/worlds" });
    expect(response.statusCode).toBe(401);
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
});
