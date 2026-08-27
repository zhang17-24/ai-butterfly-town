/**
 * D70 E2E 冒烟(HTTP 层,进程内):登录 → 世界 → tick → 移动 → 对话 → 事件 → 记忆 →
 * 跳过 → 分支 → 一句话建世界 → 蓝图/地图 → OpenAPI。
 *   tsx apps/server/scripts/e2e-smoke.ts
 * 输出每步 PASS/FAIL,任一步失败即退出码 1。浏览器级 E2E 见 docs/delivery.md(ego-browser 清单)。
 */
import { buildApp } from "../src/app.js";

const steps: Array<{ name: string; run: () => Promise<boolean> }> = [];
const step = (name: string, run: () => Promise<boolean>) => steps.push({ name, run });

async function main() {
  const built = await buildApp({ databasePath: ":memory:", tickMs: 60_000, cookieSecret: "smoke-secret" });
  const { app, repository, simulation } = built;
  let cookie = "";

  const post = async (path: string, body: unknown) => app.inject({ method: "POST", url: path, payload: body, headers: { cookie } });
  const get = async (path: string) => app.inject({ method: "GET", url: path, headers: { cookie } });

  step("登录 demo", async () => {
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "demo", password: "town1234" } });
    const setCookie = login.headers["set-cookie"];
    cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(";")[0] ?? "";
    return login.statusCode === 200 && cookie.includes("=");
  });

  step("世界状态加载(5 NPC)", async () => {
    const state = await get("/api/worlds/world_qixi_town/state");
    return state.statusCode === 200 && state.json().npcs.length === 5;
  });

  step("仿真 tick+1 分钟", async () => {
    const before = (await get("/api/worlds/world_qixi_town/state")).json();
    await simulation.tick();
    const after = (await get("/api/worlds/world_qixi_town/state")).json();
    return after.world.gameMinute === before.world.gameMinute + 1;
  });

  step("玩家移动到广场", async () => {
    const state = (await get("/api/worlds/world_qixi_town/state")).json();
    const moved = await post("/api/worlds/world_qixi_town/player/move", { target: { x: 450, y: 310 }, expectedVersion: state.world.version, idempotencyKey: crypto.randomUUID() });
    return moved.statusCode === 200 && Array.isArray(moved.json().path);
  });

  step("对话(开始→消息→结束)", async () => {
    const state = (await get("/api/worlds/world_qixi_town/state")).json();
    const started = await post("/api/worlds/world_qixi_town/dialogues/start", { npcId: "npc_lin_xia", expectedVersion: state.world.version, idempotencyKey: crypto.randomUUID() });
    if (started.statusCode !== 200) return false;
    const sessionId = started.json().session.id;
    const message = await post(`/api/dialogues/${sessionId}/messages`, { content: "市集还办吗？" });
    if (message.statusCode !== 200) return false;
    const ended = await post(`/api/dialogues/${sessionId}/end`, {});
    return ended.statusCode === 200;
  });

  step("事件注入(预览→提交→记忆 W2)", async () => {
    const preview = await post("/api/worlds/world_qixi_town/events/preview", { text: "气象台发布暴雨预警，河岸场地可能封闭" });
    if (preview.statusCode !== 200) return false;
    const state = (await get("/api/worlds/world_qixi_town/state")).json();
    const commit = await post("/api/worlds/world_qixi_town/events/commit", { preview: preview.json().preview, expectedVersion: state.world.version, idempotencyKey: crypto.randomUUID() });
    if (commit.statusCode !== 200) return false;
    const npcId = commit.json().affectedNpcs[0]?.agentId;
    const memories = await get(`/api/worlds/world_qixi_town/agents/${npcId}/memories`);
    return memories.statusCode === 200 && memories.json().some((memory: any) => memory.kind === "event");
  });

  step("跳过时间 +45 分钟(后台作业)", async () => {
    const before = (await get("/api/worlds/world_qixi_town/state")).json();
    const skip = await post("/api/worlds/world_qixi_town/skip", { targetMinute: before.world.gameMinute + 45, expectedVersion: before.world.version, idempotencyKey: crypto.randomUUID() });
    if (skip.statusCode !== 202) return false;
    const jobId = skip.json().id;
    let job;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      job = (await get(`/api/worlds/jobs/${jobId}`)).json();
      if (job.status !== "running" && job.status !== "queued") break;
    }
    return job.status === "succeeded";
  });

  step("创建分支(快照回滚)", async () => {
    const branch = await post("/api/worlds/world_qixi_town/branches", {});
    return branch.statusCode === 200 && branch.json().world.paused === true;
  });

  step("一句话创建新世界(六阶段作业)", async () => {
    const create = await app.inject({ method: "POST", url: "/api/worlds", payload: { prompt: "山间茶园小镇，有茶馆、竹林和溪边集市", population: 5, style: "qixi_pixel" }, headers: { cookie } });
    if (create.statusCode !== 201) return false;
    let job;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      job = (await get(`/api/worlds/jobs/${create.json().id}`)).json();
      if (job.status !== "running" && job.status !== "queued") break;
    }
    if (job.status !== "succeeded") return false;
    const worldId = JSON.parse(job.resultJson).worldId;
    const blueprint = await get(`/api/worlds/${worldId}/blueprint`);
    const mapImage = await get(`/api/worlds/${worldId}/map-image`);
    return blueprint.statusCode === 200 && mapImage.statusCode === 200 && mapImage.headers["content-type"] === "image/png";
  });

  step("OpenAPI 文档可读", async () => {
    const doc = await get("/api/openapi.json");
    return doc.statusCode === 200 && doc.json().paths["/api/worlds"] !== undefined;
  });

  let failed = 0;
  for (const { name, run } of steps) {
    try {
      const ok = await run();
      console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
      if (!ok) failed += 1;
    } catch (error) {
      console.log(`[FAIL] ${name} :: ${error instanceof Error ? error.message : String(error)}`);
      failed += 1;
    }
  }
  await app.close();
  console.log(`\nE2E 冒烟:${steps.length - failed}/${steps.length} 通过。`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
