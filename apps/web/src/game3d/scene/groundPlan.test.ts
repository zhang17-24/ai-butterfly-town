import { describe, expect, it } from "vitest";
import { qixiBlueprint } from "@ai-town/shared/qixi-blueprint";
import { GROUND_PALETTE, planGroundQuads } from "./groundPlan";

// GROUND_PALETTE 是 `as const`,Object.values 会推出字面量联合类型的 Set;而 GroundQuad.color 是 string,
// 这里显式放宽成 Set<string> 才能比较。断言语义不变(仍然是「颜色必须属于调色板」)。
const palette = new Set<string>(Object.values(GROUND_PALETTE));

describe("planGroundQuads", () => {
  it("把 water 地点铺成一层水面 quad", () => {
    const water = planGroundQuads(qixiBlueprint).filter((quad) => quad.layer === "water");
    expect(water).toHaveLength(1);
    // 河流 bounds: x 280 width 220 / y 0 height 620 → 中心 (390, 310)
    expect(water[0]).toMatchObject({ x: 390, z: 310, width: 220, length: 620, rotationY: 0 });
  });

  it("把 plaza 地点铺成一层广场 quad", () => {
    const plaza = planGroundQuads(qixiBlueprint).filter((quad) => quad.layer === "plaza");
    expect(plaza).toHaveLength(1);
    // 河岸市集广场 bounds: x 445 width 230 / y 115 height 300 → 中心 (560, 265)
    expect(plaza[0]).toMatchObject({ x: 560, z: 265, width: 230, length: 300, rotationY: 0 });
  });

  it("每条路径的每一段生成一条路面 quad", () => {
    const roads = planGroundQuads(qixiBlueprint).filter((quad) => quad.layer === "road");
    // west-bank 3点→2段, east-bank 3点→2段, bridge 2点→1段, east-loop 3点→2段
    expect(roads).toHaveLength(7);
  });

  it("桥面 quad 沿 x 轴铺开,朝向为 +x", () => {
    const roads = planGroundQuads(qixiBlueprint).filter((quad) => quad.layer === "road");
    // bridge: (250,285) → (535,285),宽 54
    const bridge = roads.find((quad) => quad.width === 54);
    expect(bridge).toBeDefined();
    expect(bridge!.x).toBeCloseTo(392.5);
    expect(bridge!.z).toBeCloseTo(285);
    expect(bridge!.length).toBeCloseTo(285);
    expect(bridge!.rotationY).toBeCloseTo(Math.PI / 2);
  });

  it("所有颜色都取自锁定调色板", () => {
    for (const quad of planGroundQuads(qixiBlueprint)) {
      expect(palette.has(quad.color)).toBe(true);
    }
  });
});
