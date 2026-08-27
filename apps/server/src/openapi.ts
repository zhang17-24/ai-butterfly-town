/**
 * D109 OpenAPI:从 Fastify 路由表自动生成 OpenAPI 3.0 骨架。
 * 负责:注册 GET /api/openapi.json;main() 在 app.ready() 后调用 buildOpenApi(app)。
 * 说明:各路由未逐个挂 zod schema,本模块按「方法+路径+已知语义表」生成可浏览的
 * 接口清单(摘要/请求体示例/响应说明),足以支撑面试讲解与联调;后续可替换为
 * @fastify/swagger 全量 schema 模式。
 */
import type { FastifyInstance } from "fastify";

const DOC: Record<string, { summary: string; requestExample?: unknown; responseExample?: unknown; parameters?: string }> = {
  "GET /api/health": { summary: "运行状态:AI/Mock 模式与模型名" },
  "POST /api/auth/login": {
    summary: "登录(JSON body,设置会话 Cookie)",
    requestExample: { username: "demo", password: "town1234" },
    responseExample: { id: "u_demo", username: "demo" },
  },
  "GET /api/auth/me": { summary: "当前会话身份" },
  "GET /api/worlds": { summary: "我的世界列表(WorldSummary[])" },
  "GET /api/worlds/:worldId/state": { summary: "世界全量状态(玩家+5 居民+最近事件)" },
  "POST /api/worlds": {
    summary: "一句话创建新世界(M7):六阶段后台作业",
    requestExample: { prompt: "一座花田小村，有茶馆、果园和河畔舞台", population: 5, style: "qixi_pixel" },
  },
  "GET /api/worlds/jobs/:jobId": { summary: "生成/跳时作业进度(status/stageIndex/progressPercent/resultJson)" },
  "POST /api/worlds/:worldId/pause": { summary: "暂停/继续仿真", requestExample: { paused: true, expectedVersion: 42, idempotencyKey: "..." } },
  "POST /api/worlds/:worldId/player/move": { summary: "玩家 A* 移动", requestExample: { target: { x: 450, y: 310 }, expectedVersion: 42, idempotencyKey: "..." } },
  "POST /api/worlds/:worldId/dialogues/start": { summary: "开始与 NPC 对话", requestExample: { npcId: "npc_lin_xia", expectedVersion: 42, idempotencyKey: "..." } },
  "GET /api/worlds/:worldId/dialogues/active": { summary: "当前对话会话(含消息)" },
  "POST /api/dialogues/:sessionId/messages": { summary: "发送消息(召回记忆注入上下文,AI/Mock 回复)", requestExample: { content: "你好，市集还办吗？" } },
  "POST /api/dialogues/:sessionId/end": { summary: "结束对话" },
  "POST /api/worlds/:worldId/events/preview": { summary: "事件注入预览(M5):解析→结构化+知识传播预估", requestExample: { text: "气象台发布暴雨预警，河岸场地可能封闭" } },
  "POST /api/worlds/:worldId/events/commit": { summary: "确认写入事件:单事务事件+knowledge+memories(W2)+版本", requestExample: { preview: {}, expectedVersion: 42, idempotencyKey: "..." } },
  "GET /api/worlds/:worldId/timeline": { summary: "事件时间线(紧凑)", parameters: "afterVersion, limit" },
  "GET /api/worlds/:worldId/causal": { summary: "因果图(节点事件+边 causeIds)" },
  "POST /api/worlds/:worldId/skip": { summary: "时间快进(M6):后台作业,紧急事件提前停", requestExample: { targetMinute: 600, expectedVersion: 42, idempotencyKey: "..." } },
  "POST /api/worlds/:worldId/branches": { summary: "从最新快照创建时间线分支并回滚世界状态" },
  "GET /api/worlds/:worldId/snapshots": { summary: "周期/重大事件/初始快照列表" },
  "GET /api/worlds/:worldId/blueprint": { summary: "世界蓝图(生成世界)/栖溪镇默认蓝图" },
  "GET /api/worlds/:worldId/map-image": { summary: "生成世界的程序化地图 PNG" },
  "GET /api/worlds/:worldId/agents/:agentId/memories": { summary: "NPC 记忆列表(kind/importance/subject/recall 依据)", parameters: "kind, limit" },
  "GET /api/worlds/:worldId/agents/:agentId/decisions": { summary: "该 NPC 决策 AI Trace" },
  "GET /api/worlds/:worldId/agent-traces": { summary: "全居民/世界级 Trace(调试台用)", parameters: "role, limit" },
};

export function buildOpenApiDocument(app: FastifyInstance): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  const stack: Array<{ depth: number; path: string }> = [];
  const flatten = (lines: string[]): Array<{ url: string; methods: string[] }> => {
    const result: Array<{ url: string; methods: string[] }> = [];
    for (const line of lines) {
      const depth = (line.match(/[│├└─]/g) ?? []).length;
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
      const cleaned = line.replace(/^[\s│├└─]*/g, "").trim();
      const match = cleaned.match(/^(\S+)\s+\(([^)]*)\)\s*$/);
      if (match) {
        const parent = stack[stack.length - 1]?.path ?? "";
        const url = joinPath(parent, match[1]);
        result.push({ url, methods: match[2].split(",").map((item) => item.trim()) });
        stack.push({ depth, path: url });
        continue;
      }
      const current = joinPath(stack[stack.length - 1]?.path ?? "", cleaned);
      stack.push({ depth, path: current });
    }
    return result;
  };

  for (const { url, methods } of flatten(app.printRoutes({ commonPrefix: false }).split("\n"))) {
    if (!url.startsWith("/api/")) continue;
    for (const methodToken of methods) {
      const method = methodToken.toUpperCase();
      if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) continue;
      const doc = DOC[`${method} ${url}`];
      const operation: Record<string, unknown> = {
        summary: doc?.summary ?? `接口 ${method} ${url}`,
        tags: [url.split("/")[2] ?? "api"],
        responses: { "200": { description: "成功;错误统一 {error:{code,message,recoverable,details}}" } },
      };
      if (doc?.requestExample) {
        operation.requestBody = {
          required: true,
          content: { "application/json": { example: doc.requestExample } },
        };
      }
      if (doc?.parameters) {
        operation.parameters = doc.parameters.split(",").map((name) => ({
          name: name.trim(), in: "query", required: false, schema: { type: "string" },
        }));
      }
      paths[url] = { ...(paths[url] ?? {}), [method.toLowerCase()]: operation };
    }
  }
  return {
    openapi: "3.0.3",
    info: {
      title: "AI 蝴蝶小镇 (AI Butterfly Town)",
      version: "0.1.0",
      description: "腾讯 AI 全栈面试作业:栖溪镇实时仿真 API。AI 决策(MiniMax/DeepSeek 兼容 chat)失败自动降级 Mock;无 Key 完全可体验。",
    },
    servers: [{ url: "/" }],
    paths,
  };
}

export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  app.get("/api/openapi.json", async () => buildOpenApiDocument(app));
}

function joinPath(base: string, segment: string): string {
  const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const cleanSegment = segment.startsWith("/") ? segment : `/${segment}`;
  return `${cleanBase}${cleanSegment}`;
}
