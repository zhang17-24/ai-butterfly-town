import { createHash } from "node:crypto";
import type { CharacterVisualSpec, NpcProfile, PixelStyleSpec } from "@ai-town/shared";
import { createNavigationGrid } from "@ai-town/shared";
import { findPath } from "../navigation/a-star.js";
import { VisualGenerationOrchestrator } from "./visual-orchestrator.js";
import { buildInitialNpcStates, createTemplateWorldStructure, validateWorldStructure, qixiPixelStyle, type StructureIssue, type WorldPackage, type WorldStructure } from "./world-structure.js";

export interface StructureProvider {
  readonly enabled: boolean;
  readonly providerName: string;
  generateStructure(input: { prompt: string; seed: number; npcCount: number }): Promise<WorldStructure>;
}

export interface GenerateWorldOptions {
  npcCount?: number;
  style?: PixelStyleSpec;
}

export class WorldGenerationError extends Error {
  constructor(readonly issues: StructureIssue[]) {
    super(`STRUCTURE_INVALID:${issues.map((issue) => issue.code).join(",")}`);
    this.name = "WorldGenerationError";
  }
}

// M7 世界生成管线(阶段 1-6)。结构与视觉依赖注入,便于无 Key 时用模板/程序化降级,也便于单测。
export class WorldGenerator {
  constructor(
    private readonly structure: StructureProvider,
    private readonly visual: VisualGenerationOrchestrator,
  ) {}

  async generate(prompt: string, seed: number, options: GenerateWorldOptions = {}): Promise<WorldPackage> {
    const npcCount = Math.max(3, options.npcCount ?? 5);
    const style = options.style ?? qixiPixelStyle;

    // 1. STRUCTURE:真实 Provider 或模板
    const structure = this.structure.enabled
      ? await this.structure.generateStructure({ prompt, seed, npcCount })
      : createTemplateWorldStructure(seed, npcCount);
    const normalized = ensurePopulation(structure, npcCount);

    // 2. VALIDATE_STRUCTURE
    const validation = validateWorldStructure(normalized);
    if (!validation.ok) throw new WorldGenerationError(validation.issues);

    // 3+4. GENERATE_ART + VISION_REVIEW(VisualGenerationOrchestrator 内部处理降级/审查/重试一次)
    const assetManifest = await this.visual.generateMap(normalized.blueprint, style, {
      proceduralUrl: `assets/procedural/${normalized.worldId}-map.png`,
      blueprintHash: hashStructure(normalized),
    });
    const asset = {
      imageUrl: assetManifest.imageUrl,
      source: assetManifest.source,
      review: { verdict: assetManifest.review.verdict, feedback: assetManifest.review.feedback },
    };

    // 5. PATH_TEST:出生点到每个建筑入口的可达性
    const pathReport = testPaths(normalized);

    // 6. ASSEMBLE
    return {
      worldId: normalized.worldId,
      name: normalized.name,
      description: normalized.description,
      blueprint: normalized.blueprint,
      npcs: buildInitialNpcStates(normalized, seed),
      asset,
      characterSpecs: normalized.npcs.map((npc) => buildCharacterSpec(npc, style)),
      rules: normalized.rules,
      pathReport,
      validation,
    };
  }
}

function ensurePopulation(structure: WorldStructure, target: number): WorldStructure {
  if (structure.npcs.length >= target) return structure;
  const plazaId = structure.blueprint.locations.find((location) => location.kind === "plaza")?.id ?? structure.blueprint.locations[0]?.id;
  const base = structure.npcs.slice();
  const homeLocations = { ...structure.homeLocations };
  const extra: NpcProfile[] = [];
  const colors = ["#e9704f", "#4f8fca", "#8a9a5b", "#d5974f", "#7a6bb5"];
  let index = base.length;
  while (base.length + extra.length < target) {
    const id = `npc_gen_${index}`;
    extra.push({
      id,
      name: `新客${index + 1}`,
      age: 24 + index,
      role: index % 2 === 0 ? "杂货店主" : "社区护士",
      color: colors[index % colors.length],
      personality: `${structure.name}的新居民，性格开朗。`,
      motivation: "安顿下来并熟悉小镇。",
      preferences: ["安静", "规律"],
      dislikes: ["吵闹"],
      traits: { sociability: 60, conscientiousness: 60, curiosity: 55, riskTolerance: 35 },
    });
    if (plazaId) homeLocations[id] = plazaId;
    index += 1;
  }
  return { ...structure, npcs: [...base, ...extra], homeLocations };
}

function testPaths(structure: WorldStructure): { tested: number; unreachable: number } {
  const grid = createNavigationGrid(structure.blueprint);
  const spawn = structure.blueprint.spawnPoints[0]?.position ?? { x: 0, y: 0 };
  const targets = structure.blueprint.locations.filter((location) => location.kind === "building").flatMap((location) => location.entrances);
  let unreachable = 0;
  for (const target of targets) if (!findPath(grid, spawn, target)) unreachable += 1;
  return { tested: targets.length, unreachable };
}

function hashStructure(structure: WorldStructure): string {
  return createHash("sha256").update(JSON.stringify(structure.blueprint)).digest("hex").slice(0, 16);
}

function buildCharacterSpec(npc: NpcProfile, style: PixelStyleSpec): CharacterVisualSpec {
  return {
    npcId: npc.id,
    appearance: `${npc.role}，${npc.name}`,
    columns: 6,
    rows: 5,
    rowSemantics: ["walk_left", "walk_front", "walk_back", "idle_front", "expressions"],
    transparentBackground: true,
  };
}
