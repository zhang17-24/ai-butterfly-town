import type { WorldBlueprint } from "@ai-town/shared";

/** 取自锁定调色板的建筑与门窗配色。 */
export const BUILDING_PALETTE = {
  wall: "#c79463",
  roof: "#7c5141",
  door: "#7c5141",
  window: "#194f59",
} as const;

const MIN_HEIGHT = 24;
const MAX_HEIGHT = 60;
const PLAZA_HEIGHT = 1;

export interface BuildingMass {
  id: string;
  name: string;
  kind: "building" | "plaza";
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  doors: Array<{ x: number; z: number }>;
}

/**
 * 由 blueprint 地点推导建筑体块。高度由占地宽度确定性地推出,
 * 不需要 per-location 手写高度表,新生成的世界的建筑也能自动得到合理高度。
 */
export function planBuildingMasses(blueprint: WorldBlueprint): BuildingMass[] {
  return blueprint.locations
    .filter((location) => location.kind === "building" || location.kind === "plaza")
    .map((location) => ({
      id: location.id,
      name: location.name,
      kind: location.kind as "building" | "plaza",
      x: location.bounds.x + location.bounds.width / 2,
      z: location.bounds.y + location.bounds.height / 2,
      width: location.bounds.width,
      depth: location.bounds.height,
      height: location.kind === "plaza"
        ? PLAZA_HEIGHT
        : Math.min(MAX_HEIGHT, MIN_HEIGHT + location.bounds.width / 10),
      doors: location.entrances.map((entrance) => ({ x: entrance.x, z: entrance.y })),
    }));
}
