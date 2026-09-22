import { createNavigationGrid, type WorldBlueprint } from "@ai-town/shared";

export interface WalkableCell {
  x: number;
  z: number;
}

/** 可走格中心(世界坐标 = 场景平面坐标),供 3D 叠加层做实例化渲染。 */
export function planWalkableCells(blueprint: WorldBlueprint): WalkableCell[] {
  const grid = createNavigationGrid(blueprint);
  const cells: WalkableCell[] = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      if (!grid.walkable[row][column]) continue;
      cells.push({
        x: column * grid.tileSize + grid.tileSize / 2,
        z: row * grid.tileSize + grid.tileSize / 2,
      });
    }
  }
  return cells;
}
