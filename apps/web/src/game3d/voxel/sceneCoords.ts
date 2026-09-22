import type { Position } from "@ai-town/shared";

/** 世界坐标(blueprint 像素,x 向右 / y 向下)→ 场景坐标(x 向右 / y 向上 / z 向里)。1 world px = 1 scene unit。 */
export function worldToScene(position: Position): [number, number, number] {
  return [position.x, 0, position.y];
}

/** 场景平面坐标 → 世界坐标。raycast 命中地面的点用这个还原成服务端接受的整数坐标。 */
export function sceneToWorld(x: number, z: number): Position {
  return { x: Math.round(x), y: Math.round(z) };
}

/** 地图中心,相机 target 与平移夹取的基准。 */
export function worldCenter(canvas: { width: number; height: number }): [number, number, number] {
  return [canvas.width / 2, 0, canvas.height / 2];
}

/** 移动方向 → 绕 y 轴的弧度。角色模型的朝向定义为 +z。 */
export function yawFromSegment(from: Position, to: Position): number {
  return Math.atan2(to.x - from.x, to.y - from.y);
}
