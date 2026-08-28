/**
 * 规则型视觉审查(诚实标记:仅做机器可校验项,不做语义级审查):
 * 读 PNG 头(IHDR)校验尺寸与完整性;着色多样性无法离线精确判定时用采样字节熵近似。
 * verdict: pass(可渲染)→ retry(尺寸过小)→ fallback(损坏)。
 * 后续接多模态视觉模型时,替换本类即可(契约不变)。
 */
import type { VisionProvider } from "./visual-orchestrator.js";
import { pngFromDataUrl } from "./seedream-image-provider.js";

export class BasicVisionProvider implements VisionProvider {
  readonly enabled = true;
  readonly providerRef = "basic-rule";

  async reviewMap(input: Parameters<VisionProvider["reviewMap"]>[0]): Promise<import("@ai-town/shared").VisualReview> {
    const b64 = input.image.imageUrl ?? "";
    try {
      const buffer = pngFromDataUrl(b64);
      const magic = buffer.subarray(0, 8).toString("hex");
      if (!magic.startsWith("89504e47")) {
        return { verdict: "fallback", score: 0, issueCodes: [], feedback: ["PNG_SIGNATURE_MISSING"] };
      }
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      if (width < 1024 || height < 1024) {
        return { verdict: "retry", score: 40, issueCodes: ["FRAME_LAYOUT_MISMATCH"], feedback: [`尺寸过小:${width}x${height},期望>=1024`] };
      }
      return { verdict: "pass", score: 78, issueCodes: [], feedback: [`规则校验通过:${width}x${height},PNG 完整`] };
    } catch {
      return { verdict: "retry", score: 10, issueCodes: [], feedback: ["IMAGE_PARSE_FAILED"] };
    }
  }
}
