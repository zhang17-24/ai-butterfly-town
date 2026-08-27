import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";

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
  });

  it("rejects world access without a login cookie", async () => {
    const built = await buildApp({ databasePath: ":memory:", tickMs: 60_000, cookieSecret: "test-secret" });
    activeApp = built.app;
    const response = await built.app.inject({ method: "GET", url: "/api/worlds" });
    expect(response.statusCode).toBe(401);
  });
});
