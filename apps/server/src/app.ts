import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { BranchCreateInputSchema, CreateWorldInputSchema, EventCommitInputSchema, SkipTimeInputSchema, type RealtimeMessage } from "@ai-town/shared";
import { openDatabase } from "./db/database.js";
import { TownRepository } from "./db/repository.js";
import { createSessionToken, SESSION_COOKIE, verifySessionToken } from "./auth/session.js";
import { WorldHub } from "./realtime/world-hub.js";
import { SimulationService } from "./simulation/simulation-service.js";
import { loadConfig, type AppConfig } from "./config.js";
import { OpenAICompatibleProvider } from "./ai/provider.js";
import { SimulationDecisionService } from "./ai/simulation-decider.js";
import { DialogueDecisionService } from "./ai/dialogue-decider.js";
import { buildEventPreview } from "./domain/event-preview.js";
import { computeKnowledgeSpread } from "./domain/event-propagation.js";
import { qixiBlueprint } from "./generation/qixi-blueprint.js";
import { VisualGenerationOrchestrator } from "./generation/visual-orchestrator.js";
import { JobWorker } from "./jobs/worker.js";
import { buildGenerateWorldHandler } from "./jobs/generate-world-handler.js";

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
const MovePlayerSchema = z.object({
  target: z.object({ x: z.number().min(0).max(900), y: z.number().min(0).max(620) }),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(128),
});
const StartDialogueSchema = z.object({
  npcId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(128),
});
const DialogueMessageInputSchema = z.object({ content: z.string().trim().min(1).max(500) });

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
  const dialogueDecider = new DialogueDecisionService(aiProvider);
  const simulation = new SimulationService(repository, hub, config.tickMs, decider, config.simulationAi.maxDecisionsPerTick);
  const visualOrchestrator = new VisualGenerationOrchestrator(
    { enabled: false, async generateMap() { throw new Error("IMAGE_DISABLED"); } },
    { enabled: false, async reviewMap() { throw new Error("VISION_DISABLED"); } },
  );
  const jobWorker = new JobWorker(repository, {
    generate_world: buildGenerateWorldHandler(repository, visualOrchestrator),
    skip_world: async (job, report) => {
      const payload = JSON.parse(repository.getJobPayload(job.id)) as { worldId: string; targetMinute: number };
      const result = await simulation.advanceTo(payload.worldId, payload.targetMinute, {
        onProgress: (minute, total) => report(0, "SKIP", Math.min(99, Math.round((minute / total) * 100)), `${minute}/${total}`),
      });
      return { ...result, worldId: payload.worldId };
    },
  });

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

  app.post<{ Params: { worldId: string } }>("/api/worlds/:worldId/player/move", { preHandler: requireUser }, async (request, reply) => {
    const parsed = MovePlayerSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_MOVE", message: "移动目标格式不正确", recoverable: true, details: {} } });
    const command = repository.executeMovePlayerCommand({ userId: request.userId!, worldId: request.params.worldId, ...parsed.data });
    if (command.kind === "not_found") return reply.code(404).send({ error: { code: "WORLD_OR_PLAYER_NOT_FOUND", message: "世界或玩家不存在", recoverable: false, details: {} } });
    if (command.kind === "unreachable") return reply.code(422).send({ error: { code: "TARGET_NOT_WALKABLE", message: "那里无法到达，请点击道路或广场", recoverable: true, details: {} } });
    if (command.kind === "idempotency_conflict") return reply.code(409).send({ error: { code: "IDEMPOTENCY_KEY_REUSED", message: "同一个请求标识不能用于不同命令", recoverable: true, details: {} } });
    if (command.kind === "version_conflict") return reply.code(409).send({ error: { code: "WORLD_VERSION_CONFLICT", message: "世界状态已经变化，请刷新后重试", recoverable: true, details: { currentVersion: command.currentVersion } } });
    if (!command.result.replayed) {
      hub.broadcast(command.result.world.id, {
        eventId: command.result.event.id,
        worldId: command.result.world.id,
        branchId: command.result.world.activeBranchId,
        version: command.result.world.version,
        emittedAt: new Date().toISOString(),
        type: "world.status",
        data: command.result.world,
        event: command.result.event,
      } satisfies RealtimeMessage);
    }
    return command.result;
  });

  app.post<{ Params: { worldId: string } }>("/api/worlds/:worldId/dialogues/start", { preHandler: requireUser }, async (request, reply) => {
    const parsed = StartDialogueSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_DIALOGUE", message: "对话请求格式不正确", recoverable: true, details: {} } });
    const command = repository.executeStartDialogueCommand({ userId: request.userId!, worldId: request.params.worldId, ...parsed.data });
    if (command.kind === "not_found") return reply.code(404).send({ error: { code: "WORLD_PLAYER_OR_NPC_NOT_FOUND", message: "世界、玩家或居民不存在", recoverable: false, details: {} } });
    if (command.kind === "busy") return reply.code(409).send({ error: { code: "DIALOGUE_ALREADY_ACTIVE", message: "请先结束当前对话", recoverable: true, details: {} } });
    if (command.kind === "unreachable") return reply.code(422).send({ error: { code: "NPC_UNREACHABLE", message: "暂时找不到可以接近这名居民的路线", recoverable: true, details: {} } });
    if (command.kind === "version_conflict") return reply.code(409).send({ error: { code: "WORLD_VERSION_CONFLICT", message: "世界状态已经变化，请刷新后重试", recoverable: true, details: { currentVersion: command.currentVersion } } });
    if (!command.replayed) {
      hub.broadcast(command.result.world.id, {
        eventId: command.result.event.id, worldId: command.result.world.id, branchId: command.result.world.activeBranchId,
        version: command.result.world.version, emittedAt: new Date().toISOString(), type: "world.status",
        data: command.result.world, event: command.result.event,
      } satisfies RealtimeMessage);
    }
    return command.result;
  });

  app.get<{ Params: { worldId: string } }>("/api/worlds/:worldId/dialogues/active", { preHandler: requireUser }, async (request) => {
    return repository.getActiveDialogue(request.userId!, request.params.worldId);
  });

  app.post<{ Params: { sessionId: string } }>("/api/dialogues/:sessionId/messages", { preHandler: requireUser }, async (request, reply) => {
    const parsed = DialogueMessageInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_MESSAGE", message: "请输入 1–500 个字符", recoverable: true, details: {} } });
    const context = repository.dialogueContext(request.userId!, request.params.sessionId);
    if (!context) return reply.code(404).send({ error: { code: "DIALOGUE_NOT_ACTIVE", message: "对话不存在或已经结束", recoverable: true, details: {} } });
    const recalled = repository.recallMemories(context.world.id, context.npc.profile.id, parsed.data.content, {
      worldTimeMinute: context.world.gameMinute, relatedAgentId: context.player.id, maxEntries: 6, maxChars: 600,
    });
    const decided = await dialogueDecider.decide({
      npc: context.npc, world: context.world, player: context.player,
      relationshipSummary: context.relationshipSummary, recentMemories: context.recentMemories,
      recalledMemories: recalled, playerMessage: parsed.data.content,
    });
    const result = repository.sendDialogueMessage({
      userId: request.userId!, sessionId: request.params.sessionId, content: parsed.data.content,
      memory: decided.memory, reply: { content: decided.content, source: decided.source }, trace: decided.trace,
    });
    if (!result) return reply.code(404).send({ error: { code: "DIALOGUE_NOT_ACTIVE", message: "对话不存在或已经结束", recoverable: true, details: {} } });
    hub.broadcast(result.world.id, {
      eventId: result.event.id, worldId: result.world.id, branchId: result.world.activeBranchId,
      version: result.world.version, emittedAt: new Date().toISOString(), type: "world.status", data: result.world, event: result.event,
    } satisfies RealtimeMessage);
    return result;
  });

  app.post<{ Params: { sessionId: string } }>("/api/dialogues/:sessionId/end", { preHandler: requireUser }, async (request, reply) => {
    const result = repository.endDialogue({ userId: request.userId!, sessionId: request.params.sessionId });
    if (!result) return reply.code(404).send({ error: { code: "DIALOGUE_NOT_ACTIVE", message: "对话不存在或已经结束", recoverable: true, details: {} } });
    hub.broadcast(result.world.id, {
      eventId: result.event.id, worldId: result.world.id, branchId: result.world.activeBranchId,
      version: result.world.version, emittedAt: new Date().toISOString(), type: "world.status", data: result.world, event: result.event,
    } satisfies RealtimeMessage);
    return result;
  });

  const EventPreviewInputSchema = z.object({ text: z.string().trim().min(1).max(200) });
  app.post<{ Params: { worldId: string } }>("/api/worlds/:worldId/events/preview", { preHandler: requireUser }, async (request, reply) => {
    const parsed = EventPreviewInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_EVENT_TEXT", message: "请输入 1–200 个字符的事件描述", recoverable: true, details: {} } });
    if (!repository.ownsWorld(request.userId!, request.params.worldId)) return reply.code(404).send({ error: { code: "WORLD_NOT_FOUND", message: "世界不存在", recoverable: false, details: {} } });
    const snapshot = repository.getSimulationState(request.params.worldId);
    if (!snapshot) return reply.code(404).send({ error: { code: "WORLD_NOT_FOUND", message: "世界不存在", recoverable: false, details: {} } });
    const preview = buildEventPreview(parsed.data.text, { nowMinute: snapshot.world.gameMinute, blueprint: qixiBlueprint });
    const spread = computeKnowledgeSpread(preview.preview, snapshot.npcs, qixiBlueprint);
    return {
      previewId: preview.preview.id,
      preview: {
        id: preview.preview.id,
        type: preview.preview.type,
        summary: preview.preview.summary,
        fact: preview.preview.fact,
        locationId: preview.preview.locationId ?? null,
        involvedNpcIds: preview.preview.involvedNpcIds,
        audience: preview.preview.audience,
        gameMinute: preview.preview.gameMinute ?? null,
        source: preview.preview.source,
      },
      confidence: preview.confidence,
      matchedTerms: preview.matchedTerms,
      spread: spread.map((diff) => ({ agentId: diff.agentId, via: diff.via, confidence: diff.confidence, channelReason: diff.channelReason })),
      affectedNpcCount: spread.length,
    };
  });

  app.post<{ Params: { worldId: string } }>("/api/worlds/:worldId/events/commit", { preHandler: requireUser }, async (request, reply) => {
    const parsed = EventCommitInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_EVENT_COMMAND", message: "事件提交格式不正确", recoverable: true, details: {} } });
    const command = repository.executeEventCommitCommand({
      userId: request.userId!, worldId: request.params.worldId,
      preview: parsed.data.preview, expectedVersion: parsed.data.expectedVersion, idempotencyKey: parsed.data.idempotencyKey,
    });
    if (command.kind === "not_found") return reply.code(404).send({ error: { code: "WORLD_NOT_FOUND", message: "世界不存在", recoverable: false, details: {} } });
    if (command.kind === "idempotency_conflict") return reply.code(409).send({ error: { code: "IDEMPOTENCY_KEY_REUSED", message: "同一个请求标识不能用于不同命令", recoverable: true, details: {} } });
    if (command.kind === "version_conflict") return reply.code(409).send({ error: { code: "WORLD_VERSION_CONFLICT", message: "世界状态已经变化，请刷新后重试", recoverable: true, details: { currentVersion: command.currentVersion } } });
    if (!command.result.replayed) {
      hub.broadcast(command.result.world.id, {
        eventId: command.result.event.id, worldId: command.result.world.id, branchId: command.result.world.activeBranchId,
        version: command.result.world.version, emittedAt: new Date().toISOString(), type: "world.status",
        data: command.result.world, event: command.result.event,
      } satisfies RealtimeMessage);
    }
    return command.result;
  });

  app.get<{ Params: { worldId: string }; Querystring: { afterVersion?: string; limit?: string } }>("/api/worlds/:worldId/timeline", { preHandler: requireUser }, async (request, reply) => {
    if (!repository.ownsWorld(request.userId!, request.params.worldId)) return reply.code(404).send({ error: { code: "WORLD_NOT_FOUND", message: "世界不存在", recoverable: false, details: {} } });
    const state = repository.getWorldState(request.userId!, request.params.worldId);
    if (!state) return reply.code(404).send({ error: { code: "WORLD_NOT_FOUND", message: "世界不存在", recoverable: false, details: {} } });
    const afterVersion = Number(request.query.afterVersion ?? 0);
    const limit = Number(request.query.limit ?? 50);
    return repository.listEventsAfter(request.params.worldId, state.world.activeBranchId, Number.isFinite(afterVersion) ? afterVersion : 0, Number.isFinite(limit) ? Math.min(200, limit) : 50);
  });

  app.get<{ Params: { worldId: string }; Querystring: { limit?: string } }>("/api/worlds/:worldId/causal", { preHandler: requireUser }, async (request, reply) => {
    if (!repository.ownsWorld(request.userId!, request.params.worldId)) return reply.code(404).send({ error: { code: "WORLD_NOT_FOUND", message: "世界不存在", recoverable: false, details: {} } });
    const limit = Number(request.query.limit ?? 40);
    return repository.getCausalGraph(request.params.worldId, Number.isFinite(limit) ? Math.min(200, limit) : 40);
  });

  app.get<{ Params: { worldId: string } }>("/api/worlds/:worldId/blueprint", { preHandler: requireUser }, async (request, reply) => {
    const result = repository.getWorldBlueprint(request.userId!, request.params.worldId);
    if (!result) return reply.code(404).send({ error: { code: "WORLD_NOT_FOUND", message: "世界不存在", recoverable: false, details: {} } });
    return { blueprint: result.blueprint, asset: result.asset, hasMapPng: Boolean(result.mapPngB64) };
  });

  app.get<{ Params: { worldId: string } }>("/api/worlds/:worldId/map-image", { preHandler: requireUser }, async (request, reply) => {
    const png = repository.getWorldMapPng(request.userId!, request.params.worldId);
    if (!png) return reply.code(404).send({ error: { code: "MAP_NOT_FOUND", message: "该世界没有程序化地图", recoverable: true, details: {} } });
    return reply.header("Content-Type", "image/png").header("Cache-Control", "public, max-age=86400").send(Buffer.from(png, "base64"));
  });

  app.get<{ Params: { worldId: string } }>("/api/worlds/:worldId/snapshots", { preHandler: requireUser }, async (request, reply) => {
    if (!repository.ownsWorld(request.userId!, request.params.worldId)) return reply.code(404).send({ error: { code: "WORLD_NOT_FOUND", message: "世界不存在", recoverable: false, details: {} } });
    return repository.listSnapshots(request.params.worldId);
  });

  app.get<{ Params: { worldId: string; agentId: string }; Querystring: { kind?: string; limit?: string } }>(
    "/api/worlds/:worldId/agents/:agentId/memories",
    { preHandler: requireUser },
    async (request, reply) => {
      if (!repository.ownsWorld(request.userId!, request.params.worldId)) return reply.code(404).send({ error: { code: "WORLD_NOT_FOUND", message: "世界不存在", recoverable: false, details: {} } });
      const limit = Number(request.query.limit ?? 20);
      return repository.listMemories(request.params.worldId, request.params.agentId, {
        kind: request.query.kind, limit: Number.isFinite(limit) ? limit : 20,
      });
    },
  );

  app.post("/api/worlds", { preHandler: requireUser }, async (request, reply) => {
    const parsed = CreateWorldInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_WORLD_INPUT", message: "请填写一句话世界描述（1–200 字）", recoverable: true, details: {} } });
    const job = repository.createJob({ kind: "generate_world", payload: { ...parsed.data, userId: request.userId! } });
    return reply.code(201).send(job);
  });

  app.get<{ Params: { jobId: string } }>("/api/worlds/jobs/:jobId", { preHandler: requireUser }, async (request, reply) => {
    const job = repository.getJob(request.params.jobId);
    if (!job) return reply.code(404).send({ error: { code: "JOB_NOT_FOUND", message: "作业不存在", recoverable: false, details: {} } });
    return job;
  });

  app.post<{ Params: { worldId: string } }>("/api/worlds/:worldId/skip", { preHandler: requireUser }, async (request, reply) => {
    const parsed = SkipTimeInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_SKIP", message: "跳过目标时间格式不正确", recoverable: true, details: {} } });
    if (!repository.ownsWorld(request.userId!, request.params.worldId)) return reply.code(404).send({ error: { code: "WORLD_NOT_FOUND", message: "世界不存在", recoverable: false, details: {} } });
    const job = repository.createJob({ kind: "skip_world", worldId: request.params.worldId, payload: { worldId: request.params.worldId, targetMinute: parsed.data.targetMinute } });
    return reply.code(202).send(job);
  });

  app.post<{ Params: { worldId: string } }>("/api/worlds/:worldId/branches", { preHandler: requireUser }, async (request, reply) => {
    const parsed = BranchCreateInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_BRANCH", message: "分支请求格式不正确", recoverable: true, details: {} } });
    const command = repository.executeCreateBranchCommand({ userId: request.userId!, worldId: request.params.worldId, forkEventId: parsed.data.forkEventId ?? null, expectedVersion: parsed.data.expectedVersion, idempotencyKey: parsed.data.idempotencyKey });
    if (command.kind === "not_found") return reply.code(404).send({ error: { code: "WORLD_NOT_FOUND", message: "世界不存在", recoverable: false, details: {} } });
    if (command.kind === "idempotency_conflict") return reply.code(409).send({ error: { code: "IDEMPOTENCY_KEY_REUSED", message: "同一个请求标识不能用于不同命令", recoverable: true, details: {} } });
    if (command.kind === "version_conflict") return reply.code(409).send({ error: { code: "WORLD_VERSION_CONFLICT", message: "世界状态已经变化，请刷新后重试", recoverable: true, details: { currentVersion: command.currentVersion } } });
    hub.broadcast(request.params.worldId, {
      eventId: randomUUID(), worldId: request.params.worldId, branchId: command.world.activeBranchId, version: command.world.version,
      emittedAt: new Date().toISOString(), type: "world.status", data: command.world, event: null,
    } satisfies RealtimeMessage);
    return command;
  });

  app.get<{ Params: { worldId: string }; Querystring: { role?: string; limit?: string } }>("/api/worlds/:worldId/agent-traces", { preHandler: requireUser }, async (request, reply) => {
    if (!repository.ownsWorld(request.userId!, request.params.worldId)) return reply.code(404).send({ error: { code: "WORLD_NOT_FOUND", message: "世界不存在", recoverable: false, details: {} } });
    const limit = Number(request.query.limit ?? 30);
    return repository.listWorldTraces(request.params.worldId, Number.isFinite(limit) ? limit : 30, request.query.role);
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
    jobWorker.stop();
    hub.close();
    database.close();
  });

  await app.ready();
  simulation.start();
  jobWorker.start();
  return { app, config, repository, simulation, aiProvider, jobWorker };
}
