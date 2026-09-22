import type { WorldBlueprint } from "@ai-town/shared";
import { yawFromSegment } from "../voxel/sceneCoords";

/** 取自 PixelStyleSpec.palette(qixi-riverside-pixel-v1)的锁定色。 */
export const GROUND_PALETTE = {
  grass: "#82c2a5",
  plaza: "#efe2bc",
  road: "#efe2bc",
  water: "#194f59",
  /** 水面呼吸的另一端色(同样取自锁定调色板),由渲染层做插值。 */
  waterShallow: "#2d8184",
} as const;

export interface GroundQuad {
  x: number;
  z: number;
  /** 沿本地 z 轴的长度 */
  length: number;
  /** 沿本地 x 轴的宽度 */
  width: number;
  /** 绕 y 轴弧度,0 = 不旋转 */
  rotationY: number;
  color: string;
  layer: "water" | "plaza" | "road";
}

export function planGroundQuads(blueprint: WorldBlueprint): GroundQuad[] {
  const quads: GroundQuad[] = [];
  for (const location of blueprint.locations) {
    if (location.kind !== "water" && location.kind !== "plaza") continue;
    const layer = location.kind === "water" ? "water" : "plaza";
    quads.push({
      x: location.bounds.x + location.bounds.width / 2,
      z: location.bounds.y + location.bounds.height / 2,
      length: location.bounds.height,
      width: location.bounds.width,
      rotationY: 0,
      color: GROUND_PALETTE[layer],
      layer,
    });
  }
  for (const path of blueprint.paths) {
    for (let index = 0; index < path.points.length - 1; index += 1) {
      const from = path.points[index];
      const to = path.points[index + 1];
      quads.push({
        x: (from.x + to.x) / 2,
        z: (from.y + to.y) / 2,
        length: Math.hypot(to.x - from.x, to.y - from.y),
        width: path.width,
        rotationY: yawFromSegment(from, to),
        color: GROUND_PALETTE.road,
        layer: "road",
      });
    }
  }
  return quads;
}
