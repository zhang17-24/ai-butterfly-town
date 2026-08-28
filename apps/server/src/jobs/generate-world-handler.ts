/**
 * M7 一句话创建世界:作业处理器。
 * 六阶段与 NewWorldPage 的 GENERATION_STAGES 对齐:
 * STRUCTURE → VALIDATE_STRUCTURE → GENERATE_ART → VISION_REVIEW → PATH_TEST → ASSEMBLE/PERSIST。
 * - aiArt 且已配置 Seedream:真实生图(地图 1 张 + 每 NPC 一张 6×5 精灵表)入库;
 * - 否则/失败:程序化像素地图 + 默认像素居民(降级不阻塞,评审见 asset.review)。
 * NPC id 以世界为前缀重写(模板 id 固定,直接入库会跨世界 UNIQUE 冲突)。
 */
import type { Job } from "@ai-town/shared";
import { WorldGenerator } from "../generation/world-generator.js";
import { renderWorldMapBase64 } from "../generation/procedural-map.js";
import { VisualGenerationOrchestrator } from "../generation/visual-orchestrator.js";
import { qixiPixelStyle } from "../generation/world-structure.js";
import type { SeedreamImageProvider } from "../generation/seedream-image-provider.js";
import { createTemplateWorldStructure } from "../generation/world-structure.js";
import type { StructureProvider } from "../generation/world-generator.js";
import type { LlmStructureProvider } from "../generation/llm-structure-provider.js";
import type { TownRepository } from "../db/repository.js";
import type { JobHandler } from "./worker.js";

const STAGES = ["STRUCTURE", "VALIDATE_STRUCTURE", "GENERATE_ART", "VISION_REVIEW", "PATH_TEST", "ASSEMBLE"] as const;

export function buildGenerateWorldHandler(repository: TownRepository, orchestrator: VisualGenerationOrchestrator, imageProvider: SeedreamImageProvider | null, structureProvider: LlmStructureProvider | null): JobHandler {
  return async (job: Job, report) => {
    const payload = JSON.parse(repository.getJobPayload(job.id)) as { prompt: string; population: number; style: string; userId: string; aiArt?: boolean };
    const seed = seedFromPrompt(payload.prompt);
    let structureSource = "template";
    const adapter: StructureProvider = {
      enabled: Boolean(structureProvider?.enabled),
      providerName: structureProvider?.providerName ?? "template",
      async generateStructure(input) {
        if (!structureProvider?.enabled) return createTemplateWorldStructure(input.seed, input.npcCount);
        try {
          const { structure } = await structureProvider.generateStructure({ prompt: input.prompt, seed: input.seed, npcCount: input.npcCount });
          structureSource = "llm";
          return structure;
        } catch (error) {
          structureSource = "template";
          report(1, `AI 结构失败,模板兜底:${error instanceof Error ? error.message.slice(0, 60) : String(error)}`, 15);
          return createTemplateWorldStructure(input.seed, input.npcCount);
        }
      },
    };
    const generator = new WorldGenerator(adapter, orchestrator);
    const wishAIArt = payload.aiArt !== false && Boolean(imageProvider?.enabled);
    const setStage = (index: number, note?: string) =>
      report(index, STAGES[Math.min(index, STAGES.length - 1)], Math.round((index / STAGES.length) * 100), note);

    const pkg = await generator.generate(payload.prompt, seed, { npcCount: payload.population });
    setStage(1, structureSource === "llm" ? "AI 结构生成完成(LLM 蓝图)" : "模板结构(LLM 未启用/降级)");

    // 真实地图或程序化地图
    let pngBase64: string;
    let asset: { imageUrl: string; source: string; review: { verdict: string; score: number; issueCodes: string[]; feedback: string[] } };
    if (wishAIArt && imageProvider) {
      try {
        const manifest = await orchestrator.generateMap(pkg.blueprint, qixiPixelStyle, {
          proceduralUrl: "",
          blueprintHash: String(seed),
        });
        if (manifest.source === "ai" && manifest.imageUrl.includes("base64,")) {
          pngBase64 = manifest.imageUrl.split(",")[1] ?? "";
          asset = {
            imageUrl: `/api/worlds/${pkg.worldId}/map-image`,
            source: "ai" as const,
            review: { verdict: manifest.review.verdict, score: manifest.review.score, issueCodes: manifest.review.issueCodes, feedback: manifest.review.feedback },
          };
          setStage(2, "Seedream 地图生成完成");
        } else {
          pngBase64 = renderWorldMapBase64(pkg.blueprint);
          asset = { imageUrl: `/api/worlds/${pkg.worldId}/map-image`, source: "procedural" as const, review: { verdict: "fallback" as const, score: 0, issueCodes: [], feedback: ["AI_MAP_FALLBACK:" + manifest.review.feedback.join(";")] } };
          setStage(2, "AI 地图降级为程序化");
        }
      } catch (error) {
        pngBase64 = renderWorldMapBase64(pkg.blueprint);
        asset = { imageUrl: `/api/worlds/${pkg.worldId}/map-image`, source: "procedural" as const, review: { verdict: "fallback" as const, score: 0, issueCodes: [], feedback: ["AI_MAP_ERROR:" + (error instanceof Error ? error.message : String(error))] } };
        setStage(2, "AI 地图失败,程序化兜底");
      }
    } else {
      pngBase64 = renderWorldMapBase64(pkg.blueprint);
      asset = { imageUrl: `/api/worlds/${pkg.worldId}/map-image`, source: "procedural" as const, review: { verdict: "fallback" as const, score: 0, issueCodes: [], feedback: ["AI_VISUAL_NOT_CONFIGURED"] } };
      setStage(2, "未启用 AI 美术,程序化地图");
    }
    setStage(3, asset.review.feedback.at(-1) ?? "视觉审查完成");

    // NPC 精灵表(真实生图;失败跳过,前端回退程序化居民)
    const worldPrefix = pkg.worldId;
    const localizedNpcs = pkg.npcs.map((npc, index) => {
      const localId = `${worldPrefix}_n${index}`;
      return {
        profile: { ...npc.profile, id: localId, color: npc.profile.color },
        state: { ...npc.state, npcId: localId },
      };
    });
    let spritesGenerated = 0;
    if (wishAIArt && imageProvider) {
      for (const npc of localizedNpcs) {
        try {
          const sprite = await imageProvider.generateSprite({
            name: npc.profile.name,
            role: npc.profile.role,
            appearance: `${npc.profile.role}，${npc.profile.name}`,
          });
          repository.upsertWorldAsset(worldPrefix, "sprite", npc.profile.id, sprite.imageUrl.split(",")[1] ?? "");
          spritesGenerated += 1;
          setStage(3, `${npc.profile.name} 精灵表完成 (${spritesGenerated}/${localizedNpcs.length})`);
        } catch {
          setStage(3, `${npc.profile.name} 精灵表失败,保留程序化居民`);
        }
      }
    }

    setStage(4, `寻路测试:${pkg.pathReport.tested} 个入口,${pkg.pathReport.unreachable} 个不可达`);
    const summary = repository.createGeneratedWorld({
      userId: payload.userId,
      pkg: { ...pkg, npcs: localizedNpcs, asset },
      prompt: payload.prompt,
      seed,
      mapPngB64: pngBase64.includes(",") ? pngBase64.split(",")[1] : (pngBase64 || null),
    });
    setStage(STAGES.length, `已入库·AI 精灵表 ${spritesGenerated}/${localizedNpcs.length}`);
    return { worldId: summary.id, name: summary.name, pathReport: pkg.pathReport, spritesGenerated, assetSource: asset.source };
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
