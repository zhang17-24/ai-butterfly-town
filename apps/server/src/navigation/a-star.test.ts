import { describe, expect, it } from "vitest";
import { qixiBlueprint } from "../generation/qixi-blueprint.js";
import { createNavigationGrid, findPath } from "./a-star.js";

describe("blueprint navigation", () => {
  const grid = createNavigationGrid(qixiBlueprint);

  it("routes between river banks through the bridge", () => {
    const path = findPath(grid, { x: 540, y: 350 }, { x: 250, y: 350 });
    expect(path).not.toBeNull();
    expect(path!.some((point) => point.y >= 250 && point.y <= 320)).toBe(true);
  });

  it("rejects water and building destinations", () => {
    expect(findPath(grid, { x: 540, y: 350 }, { x: 400, y: 500 })).toBeNull();
    expect(findPath(grid, { x: 540, y: 350 }, { x: 100, y: 100 })).toBeNull();
  });
});
