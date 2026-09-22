import type { Position } from "@ai-town/shared";

/** 与 2D 一致的每单位距离耗时(ms)。 */
export const WALK_SPEED_PER_UNIT = 5;
export const PLAYER_SPEED_PER_UNIT = 4;
export const MIN_SEGMENT_MS = 110;
export const MAX_SEGMENT_MS = 240;
export const MIN_PLAYER_SEGMENT_MS = 70;
export const MAX_PLAYER_SEGMENT_MS = 180;

/** 服务端路径可能晚于角色当前渲染位置到达:从当前位置续接,避免跳到路径起点造成瞬移。 */
export function resumePath(from: Position, path: Position[]): Position[] {
  if (path.length === 0) return [];
  const [first] = path;
  const near = Math.hypot(first.x - from.x, first.y - from.y) <= 1;
  return near ? path : [from, ...path];
}

/** 与 2D 同一条时长公式:距离 × 每单位耗时,夹取到 [floorMs, ceilMs]。 */
export function segmentDurationMs(from: Position, to: Position, floorMs: number, ceilMs: number, perUnit = WALK_SPEED_PER_UNIT): number {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.max(floorMs, Math.min(ceilMs, distance * perUnit));
}
