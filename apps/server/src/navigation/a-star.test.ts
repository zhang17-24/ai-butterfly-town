import { describe, expect, it } from "vitest";
import { qixiBlueprint } from "../generation/qixi-blueprint.js";
import { createNavigationGrid, findApproachPath, findNearestWalkable, findPath } from "./a-star.js";
import { demoNpcs } from "../domain/seed.js";
import { chooseMockAction } from "../domain/mock-decision.js";

const grid = createNavigationGrid(qixiBlueprint);

describe("blueprint navigation", () => {

  it("routes between river banks through the bridge", () => {
    const path = findPath(grid, { x: 540, y: 350 }, { x: 250, y: 350 });
    expect(path).not.toBeNull();
    expect(path!.some((point) => point.y >= 250 && point.y <= 320)).toBe(true);
  });

  it("rejects water and building destinations", () => {
    expect(findPath(grid, { x: 540, y: 350 }, { x: 400, y: 500 })).toBeNull();
    expect(findPath(grid, { x: 540, y: 350 }, { x: 100, y: 100 })).toBeNull();
  });

  it("finds a reachable interaction point for an NPC inside a building footprint", () => {
    const approach = findApproachPath(grid, { x: 540, y: 350 }, { x: 610, y: 540 });
    expect(approach).not.toBeNull();
    expect(approach!.distance).toBeLessThanOrEqual(200);
    expect(approach!.path.length).toBeGreaterThan(1);
  });
});

describe("mock decision destinations stay reachable", () => {
  it("finds a path from every seeded NPC to its default action destination", () => {
    
    
    
    for (const npc of demoNpcs) {
      const action = chooseMockAction(npc, 501, 1);
      const from = findNearestWalkable(grid, npc.state.position);
      const approach = findApproachPath(grid, from, action.destination.position);
      expect(approach, `${npc.profile.id} -> ${action.destination.locationId}`).not.toBeNull();
    }
  });
});
