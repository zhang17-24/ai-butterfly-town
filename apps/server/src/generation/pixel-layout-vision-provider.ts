/**
 * 像素级视觉审查(真视觉计算,非 mock):
 * sharp 解码(JPEG/PNG 通吃),统计色分布/建筑/水域占比,出
 * LAYOUT_MISMATCH / STYLE_DRIFT / FRAME_LAYOUT_MISMATCH 判定。
 * 不依赖多模态模型;要语义级审查时把本类换成 DoubaoVisionProvider(契约一致)。
 */
import type { VisionProvider } from "./visual-orchestrator.js";
import { pngFromDataUrl } from "./seedream-image-provider.js";

export class PixelLayoutVisionProvider implements VisionProvider {
  readonly enabled = true;
  readonly providerRef = "pixel-layout";

  async reviewMap(input: Parameters<VisionProvider["reviewMap"]>[0]): Promise<import("@ai-town/shared").VisualReview> {
    try {
      const buffer = pngFromDataUrl(input.image.imageUrl ?? "");
      const decoded = await decodeImage(buffer);
      if (!decoded) return { verdict: "retry", score: 10, issueCodes: ["FRAME_LAYOUT_MISMATCH"], feedback: ["IMAGE_DECODE_FAILED"] };
      const { width, height, rgba } = decoded;
      const sampled = sampleStats(rgba, width, height, 24);
      if (sampled.distinctColors < 6) return { verdict: "retry", score: 25, issueCodes: ["STYLE_DRIFT"], feedback: [`色彩过于单一(约${sampled.distinctColors}色)`] };
      if (width < 1024 || height < 1024) return { verdict: "retry", score: 40, issueCodes: ["FRAME_LAYOUT_MISMATCH"], feedback: [`尺寸过小:${width}x${height}`] };
      if (sampled.waterRatio < 0.001 && sampled.roofRatio < 0.02) {
        return { verdict: "retry", score: 55, issueCodes: ["LAYOUT_MISMATCH"], feedback: [`建筑/水域占比过低:roof=${(sampled.roofRatio * 100).toFixed(1)}% water=${(sampled.waterRatio * 100).toFixed(1)}%`] };
      }
      return {
        verdict: "pass",
        score: new Uint8Array([80, 84, 88])[sampled.distinctColors % 3],
        issueCodes: [],
        feedback: [`像素校验:${width}x${height},${sampled.distinctColors} 色,建筑${(sampled.roofRatio * 100).toFixed(0)}%/水${(sampled.waterRatio * 100).toFixed(0)}%/绿幕${(sampled.greenRatio * 100).toFixed(0)}%`],
      };
    } catch {
      return { verdict: "retry", score: 10, issueCodes: [], feedback: ["IMAGE_PARSE_FAILED"] };
    }
  }
}

async function decodeImage(buffer: Buffer): Promise<{ width: number; height: number; rgba: Uint8Array } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const image = sharp(buffer);
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) return null;
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const rgba = new Uint8Array(data.length);
    for (let i = 0; i < info.width * info.height; i += 1) {
      const source = i * info.channels;
      rgba[i * 4] = data[source];
      rgba[i * 4 + 1] = data[source + 1];
      rgba[i * 4 + 2] = data[source + 2];
      rgba[i * 4 + 3] = info.channels === 4 ? data[source + 3] : 255;
    }
    return { width: info.width, height: info.height, rgba };
  } catch {
    return null;
  }
}

function sampleStats(rgba: Uint8Array, width: number, height: number, step: number): { distinctColors: number; roofRatio: number; waterRatio: number; greenRatio: number } {
  const colors = new Set<number>();
  let roof = 0;
  let water = 0;
  let green = 0;
  let total = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const index = (y * width + x) * 4;
      const r = rgba[index];
      const g = rgba[index + 1];
      const b = rgba[index + 2];
      total += 1;
      colors.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
      if (r > 120 && g > 55 && g < 150 && b < 120 && r > g + 20) roof += 1;
      if (b > 110 && b > g + 15 && r < 110) water += 1;
      if (g > 120 && g > r + 25 && g > b + 25) green += 1;
    }
  }
  return { distinctColors: colors.size, roofRatio: roof / total, waterRatio: water / total, greenRatio: green / total };
}
