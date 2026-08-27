import type { Position, WorldBlueprint } from "@ai-town/shared";

type Cell = { column: number; row: number };

export interface NavigationGrid {
  tileSize: number;
  columns: number;
  rows: number;
  walkable: boolean[][];
}

export function createNavigationGrid(blueprint: WorldBlueprint): NavigationGrid {
  const { width, height, tileSize } = blueprint.canvas;
  const columns = Math.ceil(width / tileSize);
  const rows = Math.ceil(height / tileSize);
  const blockingLocations = blueprint.locations.filter((location) => location.kind === "building" || location.kind === "water");
  const bridgePaths = blueprint.paths.filter((path) => path.id.includes("bridge"));
  const walkable = Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => {
    const point = cellCenter({ column, row }, tileSize);
    const blocked = blockingLocations.some((location) => point.x >= location.bounds.x
      && point.x <= location.bounds.x + location.bounds.width
      && point.y >= location.bounds.y
      && point.y <= location.bounds.y + location.bounds.height);
    if (!blocked) return true;
    return bridgePaths.some((path) => pointNearPolyline(point, path.points, path.width / 2));
  }));
  return { tileSize, columns, rows, walkable };
}

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

function pointNearPolyline(point: Position, points: Position[], radius: number): boolean {
  return points.slice(1).some((end, index) => distanceToSegment(point, points[index], end) <= radius);
}

function distanceToSegment(point: Position, start: Position, end: Position): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}
