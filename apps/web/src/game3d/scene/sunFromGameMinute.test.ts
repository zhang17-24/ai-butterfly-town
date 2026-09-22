import { describe, expect, it } from "vitest";
import { DAY_LENGTH_MINUTES, sunFromGameMinute } from "./sunFromGameMinute";

describe("sunFromGameMinute", () => {
  it("正午太阳最高且是白天", () => {
    const noon = sunFromGameMinute(12 * 60);
    expect(noon.elevationDeg).toBeCloseTo(70, 5);
    expect(noon.isNight).toBe(false);
    expect(noon.intensity).toBeCloseTo(1.6, 5);
    expect(noon.color).toBe("#fff5e0");
  });

  it("午夜太阳在地平线以下且没有直射光", () => {
    const midnight = sunFromGameMinute(0);
    expect(midnight.elevationDeg).toBeCloseTo(-70, 5);
    expect(midnight.isNight).toBe(true);
    expect(midnight.intensity).toBe(0);
    expect(midnight.color).toBe("#4a5f8a");
  });

  it("日出与日落高度角为零", () => {
    expect(sunFromGameMinute(6 * 60).elevationDeg).toBeCloseTo(0, 5);
    expect(sunFromGameMinute(18 * 60).elevationDeg).toBeCloseTo(0, 5);
  });

  it("清晨偏暖、黄昏橙红", () => {
    expect(sunFromGameMinute(7 * 60).color).toBe("#ffd0a0");
    expect(sunFromGameMinute(17 * 60 + 30).color).toBe("#ff9a5c");
  });

  it("超过一天的分钟数取模", () => {
    expect(sunFromGameMinute(DAY_LENGTH_MINUTES + 12 * 60)).toEqual(sunFromGameMinute(12 * 60));
  });

  it("负分钟数不产生 NaN", () => {
    const state = sunFromGameMinute(-30);
    expect(Number.isFinite(state.elevationDeg)).toBe(true);
    expect(Number.isFinite(state.azimuthDeg)).toBe(true);
  });

  it("方位角随一天推进扫过 360 度", () => {
    expect(sunFromGameMinute(0).azimuthDeg).toBeCloseTo(90, 5);
    expect(sunFromGameMinute(6 * 60).azimuthDeg).toBeCloseTo(180, 5);
    expect(sunFromGameMinute(18 * 60).azimuthDeg).toBeCloseTo(360, 5);
  });

  it("夜间环境光更暗更蓝", () => {
    const night = sunFromGameMinute(0);
    const day = sunFromGameMinute(12 * 60);
    expect(night.ambientIntensity).toBeLessThan(day.ambientIntensity);
    expect(night.ambientColor).toBe("#2a3a5c");
  });
});
