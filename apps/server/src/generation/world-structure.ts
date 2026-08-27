import type { NpcProfile, WorldBlueprint } from "@ai-town/shared";
import { createNavigationGrid, type NpcState, type Position } from "@ai-town/shared";
import { qixiBlueprint, qixiPixelStyle } from "./qixi-blueprint.js";

export interface WorldRules {
  seed: number;
  worldStartMinute: number;
  weather?: string;
}

// 世界生成阶段 1(STRUCTURE)的产物:世界规则、Blueprint、地点与 NPC 档案。
export interface WorldStructure {
  worldId: string;
  name: string;
  description: string;
  blueprint: WorldBlueprint;
  npcs: NpcProfile[];
  homeLocations: Record<string, string>;
  rules: WorldRules;
}

// 阶段 6(ASSEMBLE)的产物:可被后续接线持久化成 world/npcs/asset 的最小世界包。
export interface WorldPackage {
  worldId: string;
  name: string;
  description: string;
  blueprint: WorldBlueprint;
  npcs: Array<{ profile: NpcProfile; state: NpcState }>;
  asset: { imageUrl: string; source: string; review: { verdict: string; feedback: string[] } };
  characterSpecs: Array<{ npcId: string; appearance: string; columns: 6; rows: 5 }>;
  rules: WorldRules;
  pathReport: { tested: number; unreachable: number };
  validation: StructureValidation;
}

export interface StructureIssue {
  code: string;
  message: string;
}

export type StructureValidation = { ok: true } | { ok: false; issues: StructureIssue[] };

export function validateWorldStructure(structure: WorldStructure): StructureValidation {
  const issues: StructureIssue[] = [];
  const b = structure.blueprint;
  if (b.schemaVersion !== 1) issues.push({ code: "BLUEPRINT_SCHEMA", message: "blueprint.schemaVersion 必须为 1" });
  if (b.worldId !== structure.worldId) issues.push({ code: "WORLD_ID_MISMATCH", message: "blueprint.worldId 与结构 worldId 不一致" });
  if (b.canvas.width <= 0 || b.canvas.height <= 0 || b.canvas.tileSize <= 0) issues.push({ code: "INVALID_CANVAS", message: "画布尺寸必须为正" });
  if (b.locations.length < 2) issues.push({ code: "LOCATIONS_TOO_FEW", message: "至少需要 2 个地点" });
  if (b.paths.length < 1) issues.push({ code: "PATHS_TOO_FEW", message: "至少需要 1 条路径" });
  if (b.spawnPoints.length < 1) issues.push({ code: "NO_SPAWN", message: "至少需要 1 个出生点" });

  const locationIds = new Set<string>();
  for (const loc of b.locations) {
    if (locationIds.has(loc.id)) issues.push({ code: "DUPLICATE_LOCATION_ID", message: `地点 id 重复:${loc.id}` });
    locationIds.add(loc.id);
    if (loc.bounds.x < 0 || loc.bounds.y < 0 || loc.bounds.x + loc.bounds.width > b.canvas.width || loc.bounds.y + loc.bounds.height > b.canvas.height) {
      issues.push({ code: "LOCATION_OUT_OF_BOUNDS", message: `地点 ${loc.id} 超出画布` });
    }
    if (loc.kind === "building" && loc.entrances.length < 1) issues.push({ code: "NO_ENTRANCE", message: `地点 ${loc.id} 缺少入口` });
    for (const entrance of loc.entrances) {
      if (entrance.x < 0 || entrance.y < 0) issues.push({ code: "ENTRANCE_OUT_OF_BOUNDS", message: `地点 ${loc.id} 入口越界` });
    }
  }

  if (structure.npcs.length < 3) issues.push({ code: "MIN_POPULATION", message: "至少 3 名居民" });
  const npcIds = new Set<string>();
  for (const npc of structure.npcs) {
    if (npcIds.has(npc.id)) issues.push({ code: "DUPLICATE_NPC_ID", message: `NPC id 重复:${npc.id}` });
    npcIds.add(npc.id);
    const home = structure.homeLocations[npc.id];
    if (home != null && !locationIds.has(home)) issues.push({ code: "NPC_HOME_UNKNOWN", message: `NPC ${npc.id} 的家 ${home} 不存在` });
  }

  return issues.length ? { ok: false, issues } : { ok: true };
}

// 无 Key / 结构 Provider 关闭时的可复现模板:一个与栖溪镇不同的小镇,保证通过校验与寻路测试。
export function createTemplateWorldStructure(seed: number, npcCount = 5): WorldStructure {
  const rand = mulberry(seed);
  const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length) % items.length];
  const villageName = pick(["松野集", "青禾镇", "柳岸里", "云栖庄", "落霞坊"]);
  const worldId = `world_template_${seed}`;
  const blueprint = templateBlueprint(worldId);
  const { npcs, homeLocations } = templateNpcs(villageName, rand, Math.max(3, npcCount));
  return {
    worldId,
    name: villageName,
    description: `${villageName}：一个由一句话模板生成的宁静小镇，等待居民入驻。`,
    blueprint,
    npcs,
    homeLocations,
    rules: { seed, worldStartMinute: 8 * 60, weather: "晴" },
  };
}

export function buildInitialNpcStates(structure: WorldStructure, seed: number): Array<{ profile: NpcProfile; state: NpcState }> {
  const grid = createNavigationGrid(structure.blueprint);
  const spawn = structure.blueprint.spawnPoints[0]?.position ?? { x: 0, y: 0 };
  const rand = mulberry(seed ^ 0x5f3759df);
  const startMinute = structure.rules.worldStartMinute;
  return structure.npcs.map((profile) => {
    const home = structure.homeLocations[profile.id];
    const homeEntry = homeEntrance(structure.blueprint, home) ?? spawn;
    const position = nearestWalkable(grid, homeEntry);
    return {
      profile,
      state: {
        npcId: profile.id,
        locationId: home ?? structure.blueprint.locations[0]?.id ?? "plaza",
        position,
        currentAction: "安顿下来",
        actionReason: "刚来到小镇，先熟悉环境。",
        actionEndsAtMinute: startMinute + 30,
        hunger: 55 + Math.round(rand() * 20),
        energy: 55 + Math.round(rand() * 20),
        mood: 50 + Math.round(rand() * 30),
        stress: 20 + Math.round(rand() * 25),
        social: 30 + Math.round(rand() * 30),
      },
    };
  });
}

function templateBlueprint(worldId: string): WorldBlueprint {
  const style = qixiPixelStyle; // 结构几何总是权威;模板复用像素风格规范
  return {
    schemaVersion: 1,
    worldId,
    canvas: { width: 360, height: 300, tileSize: style.pixelScale >= 3 ? 30 : 20 },
    locations: [
      { id: "plaza", name: "中央广场", kind: "plaza", bounds: { x: 60, y: 30, width: 240, height: 180 }, entrances: [], capabilities: ["social", "rest", "public_info"] },
      { id: "cafe", name: "小歇咖啡", kind: "building", bounds: { x: 20, y: 20, width: 70, height: 70 }, entrances: [{ x: 100, y: 90 }], capabilities: ["eat", "rest"] },
      { id: "clinic", name: "康宁诊室", kind: "building", bounds: { x: 270, y: 200, width: 70, height: 70 }, entrances: [{ x: 264, y: 194 }], capabilities: ["health"] },
    ],
    paths: [
      { id: "path_main", width: 20, points: [{ x: 100, y: 90 }, { x: 180, y: 90 }, { x: 180, y: 194 }, { x: 264, y: 194 }] },
      { id: "path_spawn", width: 20, points: [{ x: 180, y: 60 }, { x: 180, y: 90 }] },
    ],
    spawnPoints: [{ id: "spawn", position: { x: 180, y: 60 } }],
  };
}

function templateNpcs(villageName: string, rand: () => number, count: number): { npcs: NpcProfile[]; homeLocations: Record<string, string> } {
  const firstNames = ["林", "沈", "何", "周", "唐", "顾", "苏", "程"];
  const givenNames = ["栀", "未", "青", "遥", "柠", "沚", "漾", "钺"];
  const roles = ["杂货店主", "社区护士", "木艺匠人", "花店老板", "邮差", "茶馆掌柜"];
  const hue = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));
  const npcs: NpcProfile[] = [];
  const homeLocations: Record<string, string> = {};
  for (let i = 0; i < count; i += 1) {
    const id = `npc_tpl_${i}`;
    const role = roles[i % roles.length];
    npcs.push({
      id,
      name: `${firstNames[i % firstNames.length]}${givenNames[(i + Math.floor(rand() * givenNames.length)) % givenNames.length]}`,
      age: 20 + Math.floor(rand() * 30),
      role,
      color: `#${[0xe9704f, 0x4f8fca, 0x8a9a5b, 0xd5974f, 0x7a6bb5][i % 5]}`,
      personality: `${villageName}的${role}，性格平和，乐于助人。`,
      motivation: "把日子过得安稳而充实。",
      preferences: ["安静", "规律", "邻里安宁"],
      dislikes: ["吵闹", "拖延"],
      traits: {
        sociability: hue(50 + rand() * 40),
        conscientiousness: hue(50 + rand() * 40),
        curiosity: hue(40 + rand() * 45),
        riskTolerance: hue(20 + rand() * 40),
      },
    });
    homeLocations[id] = ["plaza", "cafe", "clinic"][i % 3];
  }
  return { npcs, homeLocations };
}

function homeEntrance(blueprint: WorldBlueprint, locationId: string | undefined): Position | null {
  const loc = blueprint.locations.find((item) => item.id === locationId);
  return loc?.entrances[0] ?? null;
}

function nearestWalkable(grid: ReturnType<typeof createNavigationGrid>, target: Position): Position {
  const walkable = (x: number, y: number): boolean => {
    const col = Math.floor(x / grid.tileSize);
    const row = Math.floor(y / grid.tileSize);
    return col >= 0 && row >= 0 && col < grid.columns && row < grid.rows && grid.walkable[row][col];
  };
  if (walkable(target.x, target.y)) return target;
  for (const radius of [10, 20, 30, 40, 60, 80, 100, 140, 180]) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [0.707, -0.707], [-0.707, 0.707], [-0.707, -0.707]]) {
      const point = { x: Math.round(target.x + Number(dx) * radius), y: Math.round(target.y + Number(dy) * radius) };
      if (walkable(point.x, point.y)) return point;
    }
  }
  return target;
}

function mulberry(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { qixiBlueprint, qixiPixelStyle };
