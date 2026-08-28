/**
 * Seedream 5.0(火山方舟)生图 Provider:实现 ImageProvider 契约,
 * 额外提供 generateSprite 按 6×5 精灵表行语义生成单个 NPC 表。
 * 失败一律抛错(调用方 orchestrator/handler 负责降级);
 * 返回 imageUrl 为 data:image/png;base64,... 便于直接入库/落盘。
 */
import type { ImageGenerationInput, ImageGenerationResult, ImageProvider } from "./visual-orchestrator.js";

export interface SeedreamImageConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export interface SpriteInput {
  name: string;
  role: string;
  appearance: string;
}

export class SeedreamImageProvider implements ImageProvider {
  readonly providerRef = "seedream";
  readonly enabled: boolean;

  constructor(private readonly config: SeedreamImageConfig, private readonly fetchImpl: typeof fetch = fetch) {
    this.enabled = Boolean(config.apiKey && config.model);
  }

  async generateMap(input: ImageGenerationInput): Promise<ImageGenerationResult> {
    const prompt = [
      input.prompt,
      "必须是简单像素艺术风格（pixel art），近似 90 度俯视（top-down）清晰小图，色块边缘简洁，无复杂细节。",
      "不要文字、数字、图例、水印、UI 元素或人物；画面仅表现地形与建筑。",
    ].join("\n");
    const b64 = await this.requestImage(prompt, "2048x2048");
    return { imageUrl: `data:image/png;base64,${b64}`, providerRef: this.providerRef };
  }

  async generateSprite(input: SpriteInput): Promise<ImageGenerationResult> {
    const prompt = [
      `创建一张游戏角色精灵图（spritesheet）。角色：${input.name}，${input.role}。外观描述：${input.appearance || `${input.role}，${input.name}`}`,
      "",
      "布局必须是严格 6 列 × 5 行、每格等大的网格：",
      "- 第 1 行（6 格）：角色向左走，动作姿态连贯形成行走循环",
      "- 第 2 行（6 格）：角色面向屏幕向下走，连贯循环",
      "- 第 3 行（6 格）：角色背对屏幕向上走，连贯循环",
      "- 第 4 行：前 3 格分别为面向屏幕站立、背对屏幕站立、向左侧站立（静止待机），第 4-6 格留白",
      "- 第 5 行：完全留白",
      "",
      "硬性要求：",
      "- 风格为简洁像素艺术（pixel art），Q 版头身比约 1:2",
      "- 背景必须为纯绿色 #00B000 或相近纯绿，不要其他杂色背景",
      "- 每帧人物大小一致，居中于所属格子，不裁切、不与相邻格重叠",
      "- 不要文字、数字、网格线、水印、边框或道具说明",
    ].join("\n");
    const b64 = await this.requestImage(prompt, "2048x2048");
    return { imageUrl: `data:image/png;base64,${b64}`, providerRef: this.providerRef };
  }

  private async requestImage(prompt: string, size: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(10_000, this.config.timeoutMs));
    try {
      const response = await this.fetchImpl(this.config.baseUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.model,
          prompt,
          size,
          response_format: "b64_json",
          watermark: false,
        }),
        signal: controller.signal,
      });
      const raw = (await response.json().catch(() => null)) as { data?: Array<{ b64_json?: string }>; error?: { message?: string } } | null;
      if (!response.ok) throw new Error(`AI_IMAGE_HTTP_${response.status}:${raw?.error?.message ?? "request failed"}`);
      const b64 = raw?.data?.[0]?.b64_json;
      if (!b64) throw new Error("AI_IMAGE_EMPTY_RESPONSE");
      return b64;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error("AI_IMAGE_TIMEOUT", { cause: error });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** 从 dataUrl/base64 提取 PNG 字节(供视觉审查/解码校验)。 */
export function pngFromDataUrl(dataUrl: string): Buffer {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return Buffer.from(base64, "base64");
}
