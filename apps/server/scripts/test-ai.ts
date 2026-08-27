/**
 * D71 真实 AI 契约测试(带真实 Key 时运行):
 *   tsx apps/server/scripts/test-ai.ts          # 只测思考模型(决策/对话 chat 通道)
 *   tsx apps/server/scripts/test-ai.ts --image  # 追加生图模型(seedream)
 * 每个用例输出 PASS/FAIL 与延迟;失败只报错不崩溃,便于排查 Key/模型/网络。
 * Key 来源:.env(本脚本不打印完整 Key)。
 */
import "dotenv/config";
import { OpenAICompatibleProvider } from "../src/ai/provider.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig();
const provider = new OpenAICompatibleProvider(config.simulationAi);

const entry = async (name: string, run: () => Promise<{ ok: boolean; detail: string }>) => {
  const startedAt = Date.now();
  try {
    const result = await run();
    console.log(`${result.ok ? "[PASS]" : "[FAIL]"} ${name} (${Date.now() - startedAt}ms) ${result.detail}`);
    return result.ok;
  } catch (error) {
    console.log(`[FAIL] ${name} (${Date.now() - startedAt}ms) ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
};

let passCount = 0;
const tasks: Array<Promise<boolean>> = [];

tasks.push(entry("chat.decide(思考模型→JSON)", async () => {
  if (!provider.enabled) return { ok: false, detail: "AI_SIMULATION_API_KEY/MODEL 未配置,跳过真实调用(降级 Mock 由 app 测试覆盖)" };
  const response = await provider.completeDecision({
    instructions: "只输出 JSON 对象:{\"actionId\":\"id\",\"reason\":\"理由\"}。",
    input: { actionId: "do_work", reason: "示例" },
  });
  const parsed = JSON.parse(response.rawText);
  const ok = typeof parsed.actionId === "string";
  return { ok, detail: `model=${provider.model} style=${provider.apiStyle as string} usage=${JSON.stringify(response.usage)} raw.head=${response.rawText.slice(0, 40)}` };
}));

tasks.push(entry("chat.dialogue(思考模型→JSON 对话)", async () => {
  if (!provider.enabled) return { ok: false, detail: "未配置,跳过" };
  const response = await provider.completeDialogue({
    instructions: "只输出 JSON 对象:{\"reply\":\"回复\",\"intent\":\"greeting\"}。",
    input: { npcName: "林夏", playerMessage: "你好" },
  });
  const parsed = JSON.parse(response.rawText);
  const ok = typeof parsed.reply === "string" && parsed.reply.length > 0;
  return { ok, detail: parsed.reply.slice(0, 30) };
}));

tasks.push(entry("image.seedream(生图)", async () => {
  const key = process.env.AI_IMAGE_API_KEY ?? "";
  if (!key) return { ok: false, detail: "AI_IMAGE_API_KEY 未配置,跳过" };
  const response = await fetch(process.env.AI_IMAGE_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.AI_IMAGE_MODEL ?? "doubao-seedream-5-0-260128",
      prompt: "top-down pixel art map, tiny green field, one pond, no text",
      size: "2k",
      response_format: "b64_json",
      watermark: false,
    }),
  });
  const raw = await response.json().catch(() => null) as { data?: Array<{ b64_json?: string }>; error?: { message?: string } };
  const ok = Boolean(raw.data?.[0]?.b64_json);
  return { ok, detail: ok ? `b64 bytes=${(raw.data?.[0]?.b64_json ?? "").length}` : `HTTP ${response.status} ${raw.error?.message ?? ""}` };
}),);

Promise.all(tasks).then((results) => {
  passCount = results.filter(Boolean).length;
  console.log(`\n摘要:${passCount}/${tasks.length} 通过,${tasks.length - passCount} 跳过/失败。`);
  process.exit(tasks.length - passCount > 0 ? 1 : 0);
});
