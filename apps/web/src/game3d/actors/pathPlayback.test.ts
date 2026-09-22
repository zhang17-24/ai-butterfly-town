import { describe, expect, it } from "vitest";
import { resumePath, segmentDurationMs } from "./pathPlayback";

describe("resumePath", () => {
  it("起点就在路径首点附近时沿用原路径", () => {
    const path = [{ x: 100, y: 100 }, { x: 120, y: 100 }];
    expect(resumePath({ x: 100, y: 100 }, path)).toBe(path);
    expect(resumePath({ x: 100.5, y: 100.5 }, path)).toBe(path);
  });

  it("当前位置远离首点时把当前位置插到最前面,避免瞬移", () => {
    const path = [{ x: 100, y: 100 }, { x: 120, y: 100 }];
    expect(resumePath({ x: 60, y: 60 }, path)).toEqual([{ x: 60, y: 60 }, { x: 100, y: 100 }, { x: 120, y: 100 }]);
  });

  it("空路径返回空数组", () => {
    expect(resumePath({ x: 1, y: 1 }, [])).toEqual([]);
  });
});

describe("segmentDurationMs", () => {
  it("近距离用下限时长", () => {
    expect(segmentDurationMs({ x: 0, y: 0 }, { x: 1, y: 0 }, 110, 240)).toBe(110);
  });

  it("远距离用上限时长", () => {
    expect(segmentDurationMs({ x: 0, y: 0 }, { x: 400, y: 0 }, 110, 240)).toBe(240);
  });

  it("中距离按时长随距离线性增长", () => {
    // 距离 40 → 40 * 5 = 200ms
    expect(segmentDurationMs({ x: 0, y: 0 }, { x: 40, y: 0 }, 110, 240)).toBe(200);
  });
});
