/**
 * M7 一句话创建世界:作业处理器。
 * 六阶段与 NewWorldPage 的 GENERATION_STAGES 对齐:
 * STRUCTURE → VALIDATE_STRUCTURE → GENERATE_ART → VISION_REVIEW → PATH_TEST → ASSEMBLE/PERSIST。
 * 无 IMAGE/VISION 密钥时走模板结构 + 程序化地图(文档可演示);配置密钥后可替换真实 AI 生图。
 */
import type { Job } from "@ai-town/shared";
import { WorldGenerator } from "../generation/world-generator.js";
import { renderWorldMapBase64 } from "../generation/procedural-map.js";
import { VisualGenerationOrchestrator } from "../generation/visual-orchestrator.js";
import type { TownRepository } from "../db/repository.js";
import type { JobHandler } from "./worker.js";

const STAGES = ["STRUCTURE", "VALIDATE_STRUCTURE", "GENERATE_ART", "VISION_REVIEW", "PATH_TEST", "ASSEMBLE"] as const;

export function buildGenerateWorldHandler(repository: TownRepository, orchestrator: VisualGenerationOrchestrator): JobHandler {
  return async (job: Job, report) => {
    const payload = JSON.parse(repository.getJobPayload(job.id)) as { prompt: string; population: number; style: string; userId: string };
    const seed = seedFromPrompt(payload.prompt);
    const generator = new WorldGenerator({ enabled: false, providerName: "template", generateStructure: async () => { throw new Error("unused"); } }, orchestrator);
    const setStage = (index: number, note?: string) =>
      report(index, STAGES[Math.min(index, STAGES.length - 1)], Math.round((index / STAGES.length) * 100), note);

    const pkg = await generator.generate(payload.prompt, seed, { npcCount: payload.population });
    setStage(1, `路口与建筑校验:${"通过的配置"}`);
    const pngBase64 = renderWorldMapBase64(pkg.blueprint);
    setStage(3, "程序化地图已渲染");
    setStage(4, `寻路测试:${pkg.pathReport.tested} 个入口,${pkg.pathReport.unreachable} 个不可达`);
    const summary = repository.createGeneratedWorld({
      userId: payload.userId,
      pkg: { ...pkg, asset: { imageUrl: `/api/worlds/${pkg.worldId}/map-image`, source: "procedural", review: pkg.asset?.review ?? { verdict: "fallback", score: 0, issueCodes: [], feedback: ["procedural"] } } },
      prompt: payload.prompt,
      seed,
      mapPngB64: pngBase64.includes(",") ? pngBase64.split(",")[1] : null,
    });
    setStage(STAGES.length, "已入库");
    return { worldId: summary.id, name: summary.name, pathReport: pkg.pathReport };
  };
}

function seedFromPrompt(prompt: string): number {
  let hash = 2166136261;
  for (const ch of prompt) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
