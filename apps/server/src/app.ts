import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { RealtimeMessage } from "@ai-town/shared";
import { openDatabase } from "./db/database.js";
import { TownRepository } from "./db/repository.js";
import { createSessionToken, SESSION_COOKIE, verifySessionToken } from "./auth/session.js";
import { WorldHub } from "./realtime/world-hub.js";
import { SimulationService } from "./simulation/simulation-service.js";
import { loadConfig, type AppConfig } from "./config.js";
import { OpenAICompatibleProvider } from "./ai/provider.js";
import { SimulationDecisionService } from "./ai/simulation-decider.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: string | null;
  }
}

const LoginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
const PauseSchema = z.object({
  paused: z.boolean().default(true),
  expectedVersion: z.number().int().nonnegative().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export async function buildApp(overrides: Partial<AppConfig> = {}) {
  const config = loadConfig(overrides);
  const database = openDatabase(config.databasePath);
  const repository = new TownRepository(database);
  repository.seedDemo(config.demoUsername, bcrypt.hashSync(config.demoPassword, 10));

  const app = Fastify({ logger: false });
  await app.register(cors, { origin: config.webOrigin, credentials: true });
  await app.register(cookie);

  app.decorateRequest("userId", null);
  app.addHook("preHandler", async (request) => {
    request.userId = verifySessionToken(request.cookies[SESSION_COOKIE], config.cookieSecret);
  });

  const hub = new WorldHub(repository, config.cookieSecret);
  hub.attach(app.server);
  const aiProvider = new OpenAICompatibleProvider(config.simulationAi);
  const decider = new SimulationDecisionService(aiProvider);
  const simulation = new SimulationService(repository, hub, config.tickMs, decider, config.simulationAi.maxDecisionsPerTick);

  app.get("/api/health", async () => ({
    status: "ok",
    mode: aiProvider.enabled ? "ai-with-mock-fallback" : "mock",
    simulationModel: aiProvider.enabled ? aiProvider.model : null,
    project: "ai-butterfly-town",
  }));

  app.post("/api/auth/login", async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "请输入账号和密码" });
    const user = repository.findUserByUsername(parsed.data.username);
    if (!user || !bcrypt.compareSync(parsed.data.password, user.passwordHash)) {
      return reply.code(401).send({ error: "账号或密码错误" });
    }
    reply.setCookie(SESSION_COOKIE, createSessionToken(user.id, config.cookieSecret), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
    });
    return { id: user.id, username: user.username };
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (request, reply) => {
    if (!request.userId) return reply.code(401).send({ error: "未登录" });
    const user = repository.findUserById(request.userId);
    if (!user) return reply.code(401).send({ error: "登录已失效" });
    return { id: user.id, username: user.username };
  });

  const requireUser = async (request: FastifyRequest, reply: import("fastify").FastifyReply) => {
    if (!request.userId) return reply.code(401).send({ error: "请先登录" });
  };

  app.get("/api/worlds", { preHandler: requireUser }, async (request) => repository.listWorlds(request.userId!));
  app.get<{ Params: { worldId: string } }>("/api/worlds/:worldId/state", { preHandler: requireUser }, async (request, reply) => {
    const state = repository.getWorldState(request.userId!, request.params.worldId);
    return state ?? reply.code(404).send({ error: "世界不存在" });
  });
  app.get<{ Params: { worldId: string; agentId: string }; Querystring: { limit?: string } }>(
    "/api/worlds/:worldId/agents/:agentId/decisions",
    { preHandler: requireUser },
    async (request, reply) => {
      const limit = Number(request.query.limit ?? 10);
      const traces = repository.listAiTraces(request.userId!, request.params.worldId, request.params.agentId, Number.isFinite(limit) ? limit : 10);
      return traces ?? reply.code(404).send({ error: { code: "WORLD_NOT_FOUND", message: "世界不存在", recoverable: false, details: {} } });
    },
  );
  app.post<{ Params: { worldId: string } }>("/api/worlds/:worldId/pause", { preHandler: requireUser }, async (request, reply) => {
    const parsed = PauseSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_COMMAND", message: "暂停命令格式不正确", recoverable: true, details: {} } });
    const result = repository.executePauseCommand({ userId: request.userId!, worldId: request.params.worldId, ...parsed.data });
    if (result.kind === "not_found") return reply.code(404).send({ error: { code: "WORLD_NOT_FOUND", message: "世界不存在", recoverable: false, details: {} } });
    if (result.kind === "idempotency_conflict") return reply.code(409).send({
      error: {
        code: "IDEMPOTENCY_KEY_REUSED",
        message: "同一个请求标识不能用于不同命令",
        recoverable: true,
        details: {},
      },
    });
    if (result.kind === "version_conflict") return reply.code(409).send({
      error: {
        code: "WORLD_VERSION_CONFLICT",
        message: "世界状态已经变化，请刷新后重试",
        recoverable: true,
        details: { currentVersion: result.currentVersion },
      },
    });
    if (!result.replayed) {
      hub.broadcast(result.world.id, {
        eventId: result.event?.id ?? randomUUID(),
        worldId: result.world.id,
        branchId: result.world.activeBranchId,
        version: result.world.version,
        emittedAt: new Date().toISOString(),
        type: "world.status",
        data: result.world,
        event: result.event,
      } satisfies RealtimeMessage);
    }
    return result.world;
  });

  if (config.serveWeb) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const webDist = path.resolve(here, "../../web/dist");
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "Not found" });
      return reply.sendFile("index.html");
    });
  }

  app.addHook("onClose", async () => {
    simulation.stop();
    hub.close();
    database.close();
  });

  await app.ready();
  simulation.start();
  return { app, config, repository, simulation, aiProvider };
}
