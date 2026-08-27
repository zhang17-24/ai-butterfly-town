import { describe, expect, it } from "vitest";
import { VisualGenerationOrchestrator } from "./visual-orchestrator.js";
import { WorldGenerationError, WorldGenerator, type StructureProvider } from "./world-generator.js";
import { createTemplateWorldStructure } from "./world-structure.js";

function visual(): VisualGenerationOrchestrator {
  return new VisualGenerationOrchestrator(
    { enabled: false, generateMap: async () => { throw new Error("should not call"); } },
    { enabled: false, reviewMap: async () => { throw new Error("should not call"); } },
  );
}

function disabledProvider(enabled = false): StructureProvider {
  return { enabled, providerName: "mock", generateStructure: async () => { throw new Error("should not call when disabled"); } };
}

describe("WorldGenerator", () => {
  it("falls back to a seeded template when no structure provider is configured", async () => {
    const generator = new WorldGenerator(disabledProvider(false), visual());
    const pack = await generator.generate("一座宁静小镇", 42);
    expect(pack.worldId).toBe("world_template_42");
    expect(pack.npcs).toHaveLength(5);
    expect(pack.validation).toEqual({ ok: true });
    expect(pack.asset.source).toBe("procedural");
    expect(pack.pathReport.unreachable).toBe(0);
    expect(pack.characterSpecs).toHaveLength(5);
  });

  it("uses the provider's structure when enabled", async () => {
    const provider: StructureProvider = {
      enabled: true,
      providerName: "openai-compatible-responses",
      generateStructure: async ({ seed }) => {
        const structure = createTemplateWorldStructure(seed);
        return { ...structure, name: "自定义镇", worldId: "world_custom", blueprint: { ...structure.blueprint, worldId: "world_custom" } };
      },
    };
    const pack = await new WorldGenerator(provider, visual()).generate("自定义镇", 7);
    expect(pack.worldId).toBe("world_custom");
    expect(pack.name).toBe("自定义镇");
  });

  it("throws a WorldGenerationError when the structure fails validation", async () => {
    const provider: StructureProvider = {
      enabled: true,
      providerName: "openai-compatible-responses",
      generateStructure: async ({ seed }) => {
        const structure = createTemplateWorldStructure(seed);
        structure.blueprint.canvas.width = 0;
        return structure;
      },
    };
    await expect(new WorldGenerator(provider, visual()).generate("坏镇", 1)).rejects.toBeInstanceOf(WorldGenerationError);
  });
});
