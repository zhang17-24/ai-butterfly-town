import type { Position, WorldBlueprint } from "./index.js";

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

function cellCenter(cell: { column: number; row: number }, tileSize: number): Position {
  return { x: cell.column * tileSize + tileSize / 2, y: cell.row * tileSize + tileSize / 2 };
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
