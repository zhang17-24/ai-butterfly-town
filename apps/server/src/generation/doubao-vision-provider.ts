/**
 * 多模态视觉审查(配置启用):调用豆包/火山方舟 vision chat 接口,
 * 让视觉模型对照蓝图要求审图。未配置 AI_VISION_MODEL 时 enabled=false,
 * 由上层回退到像素级 PixelLayoutVisionProvider(二者契约一致)。
 * 探测说明:账户若只有生图授权,vision 模型会 404(InvalidEndpointOrModel),
 * 属正常降级路径,并非代码 mock。
 */
import type { VisionProvider } from "./visual-orchestrator.js";

const ALLOWED_ISSUE_CODES = ["PROJECTION_DRIFT", "LAYOUT_MISMATCH", "BLOCKED_ENTRANCE", "DISCONNECTED_PATH", "STYLE_DRIFT", "TEXT_OR_PEOPLE_PRESENT", "FRAME_LAYOUT_MISMATCH", "BACKGROUND_NOT_TRANSPARENT", "IDENTITY_DRIFT", "CLIPPED_SPRITE"];

export interface VisionAiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export class DoubaoVisionProvider implements VisionProvider {
  readonly enabled: boolean;
  readonly providerRef = "doubao-vision";

  constructor(private readonly config: VisionAiConfig, private readonly fetchImpl: typeof fetch = fetch) {
    this.enabled = Boolean(config.apiKey && config.model);
  }

  async reviewMap(input: Parameters<VisionProvider["reviewMap"]>[0]): Promise<import("@ai-town/shared").VisualReview> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(10_000, this.config.timeoutMs));
    try {
      const response = await this.fetchImpl(this.config.baseUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: "审查这张俯视像素地图(文字/水印一律不得出现):只输出 JSON:{\"verdict\":\"pass|retry\",\"score\":0-100,\"issueCodes\":[\"PROJECTION_DRIFT|LAYOUT_MISMATCH|BLOCKED_ENTRANCE|STYLE_DRIFT|TEXT_OR_PEOPLE_PRESENT\"],\"feedback\":[\"一句中文说明\"]}" },
              { type: "image_url", image_url: { url: input.image.imageUrl } },
            ],
          }],
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      const raw = (await response.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> } | null;
      const content = raw?.choices?.[0]?.message?.content ?? "";
      const parsed = JSON.parse(content) as { verdict?: string; score?: number; issueCodes?: string[]; feedback?: string[] };
      return {
        verdict: parsed.verdict === "retry" ? "retry" : "pass",
        score: Math.max(0, Math.min(100, parsed.score ?? 80)),
        issueCodes: [...new Set((parsed.issueCodes ?? []).filter((code) => ALLOWED_ISSUE_CODES.includes(code as never)))] as import("@ai-town/shared").VisualReview["issueCodes"],
        feedback: parsed.feedback ?? ["多模态审查通过"],
      };
    } catch {
      return { verdict: "retry", score: 20, issueCodes: [], feedback: ["VISION_MODEL_UNAVAILABLE"] };
    } finally {
      clearTimeout(timer);
    }
  }
}
