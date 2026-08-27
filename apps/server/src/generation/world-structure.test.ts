import { describe, expect, it } from "vitest";
import { createNavigationGrid, findPath } from "../navigation/a-star.js";
import { createTemplateWorldStructure, validateWorldStructure, buildInitialNpcStates } from "./world-structure.js";

describe("world structure", () => {
  it("produces a deterministic template that passes validation and is navigable", () => {
    const a = createTemplateWorldStructure(42);
    const b = createTemplateWorldStructure(42);
    expect(a.worldId).toBe(b.worldId);
    expect(a.npcs).toHaveLength(5);
    expect(validateWorldStructure(a)).toEqual({ ok: true });

    const grid = createNavigationGrid(a.blueprint);
    const spawn = a.blueprint.spawnPoints[0].position;
    for (const entrance of ["cafe", "clinic"].map((id) => a.blueprint.locations.find((loc) => loc.id === id)!.entrances[0])) {
      expect(findPath(grid, spawn, entrance)).not.toBeNull();
    }
  });

  it("reports structural issues that would break a world", () => {
    const structure = createTemplateWorldStructure(1);
    const broken = {
      ...structure,
      blueprint: {
        ...structure.blueprint,
        canvas: { ...structure.blueprint.canvas, width: 0 },
        locations: structure.blueprint.locations.map((loc) => loc.kind === "building" ? { ...loc, entrances: [] } : loc),
      },
      npcs: structure.npcs.slice(0, 2),
    };
    const result = validateWorldStructure(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.issues.map((issue) => issue.code);
      expect(codes).toContain("INVALID_CANVAS");
      expect(codes).toContain("NO_ENTRANCE");
      expect(codes).toContain("MIN_POPULATION");
    }
  });

  it("builds initial NPC states at walkable home positions", () => {
    const structure = createTemplateWorldStructure(7);
    const states = buildInitialNpcStates(structure, 7);
    expect(states).toHaveLength(structure.npcs.length);
    const grid = createNavigationGrid(structure.blueprint);
    for (const { profile, state } of states) {
      expect(state.npcId).toBe(profile.id);
      const col = Math.floor(state.position.x / grid.tileSize);
      const row = Math.floor(state.position.y / grid.tileSize);
      expect(grid.walkable[row][col]).toBe(true);
    }
  });
});
