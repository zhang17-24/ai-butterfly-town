import { describe, expect, it } from "vitest";
import { sceneToWorld, worldCenter, worldToScene, yawFromSegment } from "./sceneCoords";

describe("sceneCoords", () => {
  it("把世界 x/y 映射到场景 x/z 平面,y 轴向上", () => {
    expect(worldToScene({ x: 100, y: 200 })).toEqual([100, 0, 200]);
  });

  it("把场景平面坐标还原成四舍五入的整数世界坐标", () => {
    expect(sceneToWorld(100.4, 199.6)).toEqual({ x: 100, y: 200 });
    expect(sceneToWorld(518, 349)).toEqual({ x: 518, y: 349 });
  });

  it("整数坐标往返转换后不变", () => {
    const position = { x: 540, y: 300 };
    const [x, , z] = worldToScene(position);
    expect(sceneToWorld(x, z)).toEqual(position);
  });

  it("给出地图中心作为相机基准", () => {
    expect(worldCenter({ width: 900, height: 620 })).toEqual([450, 0, 310]);
  });

  it("朝向角让朝向 +z 的模型转向移动方向", () => {
    const origin = { x: 0, y: 0 };
    expect(yawFromSegment(origin, { x: 0, y: 1 })).toBeCloseTo(0);
    expect(yawFromSegment(origin, { x: 1, y: 0 })).toBeCloseTo(Math.PI / 2);
    expect(yawFromSegment(origin, { x: 0, y: -1 })).toBeCloseTo(Math.PI);
    expect(yawFromSegment(origin, { x: -1, y: 0 })).toBeCloseTo(-Math.PI / 2);
  });

  // 这里没有"回退分支":atan2(+0,+0) 本身就是 +0。用 toBeCloseTo 而不是 toBe,
  // 是因为 toBe 走 Object.is,若两个增量都是 -0 会判 -0 !== 0(而渲染并不受影响)。
  it("重合点给出 0 弧度而不是 NaN", () => {
    expect(yawFromSegment({ x: 5, y: 5 }, { x: 5, y: 5 })).toBeCloseTo(0);
  });
});
