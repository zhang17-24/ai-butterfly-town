import { describe, expect, it } from "vitest";
import { buildEventPreview } from "./event-preview.js";

describe("buildEventPreview", () => {
  it("extracts type, location, time and public audience from a rain warning", () => {
    const result = buildEventPreview("08:40 暴雨预警发布,河岸市集可能要关闭", {
      nowMinute: 500,
    });
    expect(result.preview.type).toBe("weather_alert");
    expect(result.preview.locationId).toBe("riverside");
    expect(result.preview.gameMinute).toBe(520);
    expect(result.preview.audience).toBe("public");
    expect(result.confidence).toBeGreaterThan(80);
  });

  it("defaults to local audience and community event when no hint matches", () => {
    const result = buildEventPreview("发生了一件奇怪的事", { nowMinute: 501 });
    expect(result.preview.type).toBe("community_event");
    expect(result.preview.locationId).toBeUndefined();
    expect(result.preview.audience).toBe("local");
    expect(result.preview.gameMinute).toBe(501);
    expect(result.confidence).toBe(60);
    expect(result.matchedTerms.type).toBeUndefined();
  });

  it("detects private audience and grocery location", () => {
    const result = buildEventPreview("何建国私下告诉我杂货铺明天缺货");
    expect(result.preview.audience).toBe("private");
    expect(result.preview.locationId).toBe("grocery");
    expect(result.preview.type).toBe("market_incident");
    expect(result.confidence).toBe(92);
  });

  it("detects hour point forms like 下午三点半", () => {
    const result = buildEventPreview("下午三点半社区中心举办解谜活动");
    expect(result.preview.gameMinute).toBe(15 * 60 + 30);
    expect(result.preview.locationId).toBe("community");
  });

  it("is deterministic for the same input", () => {
    const text = "晚上 8 点河岸广场临时演出,广播通知全镇居民";
    const first = buildEventPreview(text, { nowMinute: 480 });
    const second = buildEventPreview(text, { nowMinute: 480 });
    expect(second.preview).toEqual(first.preview);
    expect(second.confidence).toBe(first.confidence);
  });

  it("builds a preview id from text hash and keeps involved NPCs empty", () => {
    const result = buildEventPreview("林夏和沈知衡在咖啡馆讨论市集摊位");
    expect(result.preview.involvedNpcIds).toEqual([]);
    expect(result.preview.id).toMatch(/^preview_/);
    expect(result.preview.source).toBe("player");
  });
});
