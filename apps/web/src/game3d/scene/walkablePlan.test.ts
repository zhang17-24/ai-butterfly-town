import { describe, expect, it } from "vitest";
import { createNavigationGrid } from "@ai-town/shared";
import { qixiBlueprint } from "@ai-town/shared/qixi-blueprint";
import { planWalkableCells } from "./walkablePlan";

const cells = planWalkableCells(qixiBlueprint);

describe("planWalkableCells", () => {
  it("可走格数量与导航网格统计一致", () => {
    const grid = createNavigationGrid(qixiBlueprint);
    const expected = grid.walkable.flat().filter(Boolean).length;
    expect(cells).toHaveLength(expected);
  });

  it("每个格中心都落在网格交点上", () => {
    // 不能断言 cells[0] 是原点那格:地图左上角被咖啡馆占着,第一格可走格在 x=270
    const grid = createNavigationGrid(qixiBlueprint);
    for (const cell of cells) {
      expect((cell.x - grid.tileSize / 2) % grid.tileSize).toBe(0);
      expect((cell.z - grid.tileSize / 2) % grid.tileSize).toBe(0);
    }
  });

  it("建筑包围盒内没有任何可走格", () => {
    const cafe = qixiBlueprint.locations.find((location) => location.id === "cafe")!;
    const inside = cells.filter((cell) => cell.x >= cafe.bounds.x && cell.x <= cafe.bounds.x + cafe.bounds.width
      && cell.z >= cafe.bounds.y && cell.z <= cafe.bounds.y + cafe.bounds.height);
    expect(inside).toEqual([]);
  });

  it("桥面在河中央是可走的(桥把水面挖通了)", () => {
    const onBridge = cells.filter((cell) => cell.z > 275 && cell.z < 295 && cell.x > 300 && cell.x < 500);
    expect(onBridge.length).toBeGreaterThan(0);
  });
});
