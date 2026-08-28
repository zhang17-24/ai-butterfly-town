import type { Position } from "@ai-town/shared";
import { createNavigationGrid, type NavigationGrid } from "@ai-town/shared";

export { createNavigationGrid, type NavigationGrid } from "@ai-town/shared";

type Cell = { column: number; row: number };

export function findPath(grid: NavigationGrid, from: Position, to: Position): Position[] | null {
  const start = toCell(from, grid);
  const goal = toCell(to, grid);
  if (!isWalkable(grid, start) || !isWalkable(grid, goal)) return null;
  const key = (cell: Cell) => `${cell.column},${cell.row}`;
  const open: Cell[] = [start];
  const cameFrom = new Map<string, Cell>();
  const costs = new Map<string, number>([[key(start), 0]]);

  while (open.length > 0) {
    open.sort((a, b) => score(a, goal, costs) - score(b, goal, costs));
    const current = open.shift()!;
    if (current.column === goal.column && current.row === goal.row) return reconstruct(cameFrom, current, grid.tileSize, from, to);
    for (const next of neighbors(current)) {
      if (!isWalkable(grid, next)) continue;
      const nextCost = (costs.get(key(current)) ?? 0) + 1;
      if (nextCost >= (costs.get(key(next)) ?? Number.POSITIVE_INFINITY)) continue;
      cameFrom.set(key(next), current);
      costs.set(key(next), nextCost);
      if (!open.some((item) => item.column === next.column && item.row === next.row)) open.push(next);
    }
  }
  return null;
}

export function findNearestWalkable(grid: NavigationGrid, target: Position): Position {
  if (isWalkable(grid, toCell(target, grid))) return target;
  let nearest: Position | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      if (!grid.walkable[row][column]) continue;
      const point = cellCenter({ column, row }, grid.tileSize);
      const distance = Math.hypot(point.x - target.x, point.y - target.y);
      if (distance < nearestDistance) {
        nearest = point;
        nearestDistance = distance;
      }
    }
  }
  return nearest ?? target;
}

export function findApproachPath(grid: NavigationGrid, from: Position, target: Position): { destination: Position; path: Position[]; distance: number } | null {
  const candidates: Position[] = [];
  for (const radius of [50, 70, 90, 120, 160, 200]) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [0.7, -0.7], [-0.7, 0.7], [-0.7, -0.7]]) {
      candidates.push({ x: Math.round(target.x + Number(dx) * radius), y: Math.round(target.y + Number(dy) * radius) });
    }
  }
  return candidates
    .map((destination) => {
      const path = findPath(grid, from, destination);
      return path ? { destination, path, distance: Math.hypot(destination.x - target.x, destination.y - target.y) } : null;
    })
    .filter((item): item is { destination: Position; path: Position[]; distance: number } => Boolean(item))
    .sort((a, b) => a.distance - b.distance || a.path.length - b.path.length)[0] ?? null;
}

function reconstruct(cameFrom: Map<string, Cell>, goal: Cell, tileSize: number, from: Position, to: Position): Position[] {
  const cells = [goal];
  let current = goal;
  while (cameFrom.has(`${current.column},${current.row}`)) {
    current = cameFrom.get(`${current.column},${current.row}`)!;
    cells.push(current);
  }
  cells.reverse();
  const points = [from, ...cells.slice(1, -1).map((cell) => cellCenter(cell, tileSize)), to];
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
}

function score(cell: Cell, goal: Cell, costs: Map<string, number>): number {
  return (costs.get(`${cell.column},${cell.row}`) ?? 0) + Math.abs(cell.column - goal.column) + Math.abs(cell.row - goal.row);
}

function neighbors(cell: Cell): Cell[] {
  return [
    { column: cell.column + 1, row: cell.row },
    { column: cell.column - 1, row: cell.row },
    { column: cell.column, row: cell.row + 1 },
    { column: cell.column, row: cell.row - 1 },
  ];
}

function toCell(position: Position, grid: NavigationGrid): Cell {
  return { column: Math.floor(position.x / grid.tileSize), row: Math.floor(position.y / grid.tileSize) };
}

function cellCenter(cell: Cell, tileSize: number): Position {
  return { x: cell.column * tileSize + tileSize / 2, y: cell.row * tileSize + tileSize / 2 };
}

function isWalkable(grid: NavigationGrid, cell: Cell): boolean {
  return cell.column >= 0 && cell.row >= 0 && cell.column < grid.columns && cell.row < grid.rows && grid.walkable[cell.row][cell.column];
}
