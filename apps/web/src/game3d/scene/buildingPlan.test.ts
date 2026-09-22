import { describe, expect, it } from "vitest";
import { qixiBlueprint } from "@ai-town/shared/qixi-blueprint";
import { planBuildingMasses } from "./buildingPlan";

const masses = planBuildingMasses(qixiBlueprint);
const buildings = masses.filter((mass) => mass.kind === "building");

describe("planBuildingMasses", () => {
  it("五个建筑 + 一个广场,水面被排除", () => {
    expect(buildings).toHaveLength(5);
    expect(masses.filter((mass) => mass.kind === "plaza")).toHaveLength(1);
    expect(masses.some((mass) => mass.id === "river")).toBe(false);
  });

  it("体块以地点包围盒中心定位", () => {
    // 咖啡馆 bounds: x 0 width 255 / y 0 height 235
    expect(buildings.find((mass) => mass.id === "cafe")).toMatchObject({
      x: 127.5, z: 117.5, width: 255, depth: 235,
    });
  });

  it("建筑高度落在合理区间且随占地面积增长", () => {
    for (const building of buildings) {
      expect(building.height).toBeGreaterThan(24);
      expect(building.height).toBeLessThanOrEqual(60);
    }
    const grocery = buildings.find((mass) => mass.id === "grocery")!;      // width 190
    const apartment = buildings.find((mass) => mass.id === "apartment")!;  // width 325
    expect(apartment.height).toBeGreaterThan(grocery.height);
  });

  it("广场是贴地的薄板", () => {
    expect(masses.find((mass) => mass.kind === "plaza")!.height).toBe(1);
  });

  it("入口被转成门的位置,数量与 blueprint 一致", () => {
    expect(buildings.find((mass) => mass.id === "cafe")!.doors).toEqual([{ x: 238, z: 190 }]);
    expect(masses.find((mass) => mass.id === "riverside")!.doors).toEqual([{ x: 480, z: 300 }, { x: 650, z: 315 }]);
  });
});
