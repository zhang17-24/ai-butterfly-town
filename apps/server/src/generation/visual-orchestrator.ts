import {
  MapAssetManifestSchema,
  VisualReviewSchema,
  type MapAssetManifest,
  type CharacterVisualSpec,
  type PixelStyleSpec,
  type VisualReview,
  type WorldBlueprint,
} from "@ai-town/shared";

export interface ImageGenerationInput {
  blueprint: WorldBlueprint;
  style: PixelStyleSpec;
  prompt: string;
  previousFeedback: string[];
}

export interface ImageGenerationResult {
  imageUrl: string;
  providerRef: string;
}

export interface ImageProvider {
  readonly enabled: boolean;
  generateMap(input: ImageGenerationInput): Promise<ImageGenerationResult>;
}

export interface VisionProvider {
  readonly enabled: boolean;
  reviewMap(input: {
    blueprint: WorldBlueprint;
    style: PixelStyleSpec;
    image: ImageGenerationResult;
  }): Promise<VisualReview>;
}

export interface VisualPipelineOptions {
  maxAttempts?: number;
  prebuiltUrl?: string;
  proceduralUrl: string;
  blueprintHash: string;
}

export function buildMapPrompt(blueprint: WorldBlueprint, style: PixelStyleSpec): string {
  const places = blueprint.locations
    .filter((location) => location.kind !== "water")
    .map((location) => `${location.name}[${location.kind}]`)
    .join("、");
  return [
    `为 Web 生活模拟游戏绘制一张原创地图：${places}。`,
    `视角必须为 ${style.projection}，像素尺度 ${style.pixelScale}，${style.lighting}。`,
    `建筑语言：${style.buildingLanguage}。`,
    "严格遵守提供的蓝图位置、入口和连通路径；不得让画面反向修改碰撞几何。",
    "不要人物、车辆、文字、标签、UI、水印或等距视角。",
  ].join("\n");
}

export function buildCharacterPrompt(character: CharacterVisualSpec, style: PixelStyleSpec): string {
  return [
    `为生活模拟游戏制作原创 NPC 像素精灵表：${character.appearance}。`,
    `严格使用 ${character.columns} 列 × ${character.rows} 行等尺寸网格，行顺序为 ${character.rowSemantics.join(" / ")}。`,
    `每个动作保持同一人物身份、比例、服装和配色；${style.characterLanguage}。`,
    "画布必须是真透明背景；角色完整居中，不裁切，不加文字、道具说明、阴影底板或水印。",
  ].join("\n");
}

export class VisualGenerationOrchestrator {
  constructor(private readonly image: ImageProvider, private readonly vision: VisionProvider) {}

  async generateMap(
    blueprint: WorldBlueprint,
    style: PixelStyleSpec,
    options: VisualPipelineOptions,
  ): Promise<MapAssetManifest> {
    if (!this.image.enabled || !this.vision.enabled) {
      return this.fallback(blueprint, style, options, "AI_VISUAL_NOT_CONFIGURED");
    }

    const feedback: string[] = [];
    const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const generated = await this.image.generateMap({
          blueprint,
          style,
          prompt: buildMapPrompt(blueprint, style),
          previousFeedback: feedback,
        });
        const review = VisualReviewSchema.parse(await this.vision.reviewMap({ blueprint, style, image: generated }));
        if (review.verdict === "pass") {
          return MapAssetManifestSchema.parse({
            worldId: blueprint.worldId,
            blueprintVersion: blueprint.schemaVersion,
            blueprintHash: options.blueprintHash,
            styleSpecId: style.id,
            imageUrl: generated.imageUrl,
            source: "ai",
            review,
          });
        }
        feedback.push(...review.feedback.map((item) => `第 ${attempt} 次审查：${item}`));
        if (review.verdict === "fallback") break;
      } catch (error) {
        feedback.push(error instanceof Error ? error.message : "UNKNOWN_VISUAL_ERROR");
      }
    }
    return this.fallback(blueprint, style, options, feedback.join("; ") || "VISUAL_REVIEW_FAILED");
  }

  private fallback(
    blueprint: WorldBlueprint,
    style: PixelStyleSpec,
    options: VisualPipelineOptions,
    reason: string,
  ): MapAssetManifest {
    const usingPrebuilt = Boolean(options.prebuiltUrl);
    return MapAssetManifestSchema.parse({
      worldId: blueprint.worldId,
      blueprintVersion: blueprint.schemaVersion,
      blueprintHash: options.blueprintHash,
      styleSpecId: style.id,
      imageUrl: options.prebuiltUrl || options.proceduralUrl,
      source: usingPrebuilt ? "prebuilt" : "procedural",
      review: {
        verdict: "fallback",
        score: 0,
        issueCodes: [],
        feedback: [reason],
      },
    });
  }
}
