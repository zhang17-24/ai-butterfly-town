import { describe, expect, it, vi } from "vitest";
import { qixiBlueprint, qixiPixelStyle } from "./qixi-blueprint.js";
import { VisualGenerationOrchestrator, type ImageProvider, type VisionProvider } from "./visual-orchestrator.js";

const options = {
  blueprintHash: "sha256:test-blueprint",
  prebuiltUrl: "/assets/maps/qixi-town-prebuilt-v1.png",
  proceduralUrl: "/assets/maps/procedural.png",
};

describe("VisualGenerationOrchestrator", () => {
  it("uses prebuilt art without calling providers when visual AI is not configured", async () => {
    const image = { enabled: false, generateMap: vi.fn() } as unknown as ImageProvider;
    const vision = { enabled: false, reviewMap: vi.fn() } as unknown as VisionProvider;
    const result = await new VisualGenerationOrchestrator(image, vision).generateMap(qixiBlueprint, qixiPixelStyle, options);
    expect(result.source).toBe("prebuilt");
    expect(result.review.verdict).toBe("fallback");
    expect(image.generateMap).not.toHaveBeenCalled();
  });

  it("feeds review feedback into one retry and accepts the corrected art", async () => {
    const generateMap = vi.fn()
      .mockResolvedValueOnce({ imageUrl: "/draft.png", providerRef: "draft" })
      .mockResolvedValueOnce({ imageUrl: "/fixed.png", providerRef: "fixed" });
    const reviewMap = vi.fn()
      .mockResolvedValueOnce({ verdict: "retry", score: 62, issueCodes: ["BLOCKED_ENTRANCE"], feedback: ["诊所入口被花坛遮挡"] })
      .mockResolvedValueOnce({ verdict: "pass", score: 94, issueCodes: [], feedback: [] });
    const result = await new VisualGenerationOrchestrator(
      { enabled: true, generateMap } as ImageProvider,
      { enabled: true, reviewMap } as VisionProvider,
    ).generateMap(qixiBlueprint, qixiPixelStyle, options);
    expect(result.source).toBe("ai");
    expect(result.imageUrl).toBe("/fixed.png");
    expect(generateMap.mock.calls[1][0].previousFeedback).toContain("第 1 次审查：诊所入口被花坛遮挡");
    expect(qixiBlueprint.locations.find((item) => item.id === "clinic")?.entrances[0]).toEqual({ x: 730, y: 170 });
  });

  it("falls back after repeated review failures", async () => {
    const image = { enabled: true, generateMap: vi.fn().mockResolvedValue({ imageUrl: "/bad.png", providerRef: "bad" }) } as ImageProvider;
    const vision = { enabled: true, reviewMap: vi.fn().mockResolvedValue({ verdict: "retry", score: 30, issueCodes: ["LAYOUT_MISMATCH"], feedback: ["河流位置偏离蓝图"] }) } as VisionProvider;
    const result = await new VisualGenerationOrchestrator(image, vision).generateMap(qixiBlueprint, qixiPixelStyle, options);
    expect(result.source).toBe("prebuilt");
    expect(image.generateMap).toHaveBeenCalledTimes(2);
  });
});
