/**
 * LLM 结构生成器(D92 真实化):用 DeepSeek/思考模型为「一句话小镇」生成
 * 蓝图(建筑/道路/出生点)+ 居民画像,然后做确定性后处理(入口吸附到最近道路、
 * 坐标钳制、id 规范化),保证 validateWorldStructure 通过率。
 * parse/校验失败抛错 —— 调用方(handler)降级到模板结构并记录原因。
 */
import type { NpcProfile, WorldBlueprint } from "@ai-town/shared";
import type { SimulationAIProvider } from "../ai/provider.js";
import type { WorldStructure } from "./world-structure.js";

interface LlmLocation {
  id: string;
  name: string;
  kind: "building" | "plaza" | "outdoor" | "water";
  bounds: { x: number; y: number; width: number; height: number };
  entrances: Array<{ x: number; y: number }>;
  capabilities: string[];
}
interface LlmStructureJson {
  name: string;
  description: string;
  locations: LlmLocation[];
  paths: Array<{ id: string; width: number; points: Array<{ x: number; y: number }> }>;
  spawnPoints: Array<{ id: string; position: { x: number; y: number } }>;
  npcs: Array<{
    id: string; name: string; age: number; role: string; color: string;
    personality: string; motivation: string; preferences: string[]; dislikes: string[];
    traits: { sociability: number; conscientiousness: number; curiosity: number; riskTolerance: number };
  }>;
  homeLocations: Record<string, string>;
}

const CANVAS = { width: 900, height: 620 };

function buildInstructions(npcCount: number): string {
  return `你是一名小镇关卡设计师,为「一句话小镇」设计确定性蓝图(计算机数据,不是插图)。
只输出一个 JSON 对象,字段与形状严格如下(可以用中文内容,key 必须与我列的一致):
{"name":"镇名(2-4字)","description":"一句话描述","locations":[{"id":"英文小写id","name":"中文名","kind":"building|plaza|outdoor|water","bounds":{"x":数字,"y":数字,"width":数字,"height":数字},"entrances":[{"x":数字,"y":数字}],"capabilities":["eat|rest|work|social|safety|health|public_info 之一"]}],"paths":[{"id":"p_1","width":18,"points":[{"x":..,"y":..},{"x":..,"y":..}]}],"spawnPoints":[{"id":"player","position":{"x":..,"y":..}}],"npcs":[{"id":"npc_0","name":"中文名(2-3字)","age":30,"role":"职业","color":"#6字十六进制","personality":"一句话","motivation":"一句话","preferences":["2-4条"],"dislikes":["1-3条"],"traits":{"sociability":0-100,"conscientiousness":0-100,"curiosity":0-100,"riskTolerance":0-100}}],"homeLocations":{"npc_0":"某建筑id"}}
布局规则(必须全部遵守):
- 画布 900(宽)x620(高)。locations 数量 8-12 个:至少 4 个 kind=building(咖啡馆/诊所/杂货铺/社区类)、1 个 plaza、0-1 个 water、其余 outdoor。
- 坐标为像素:int,建筑 bounds.width 60-140、height 50-110;建筑不重叠,距离画布边缘 >= 20。
- 道路:2-3 条折线 paths,至少一条横向一条纵向贯穿,width 16-22;点位相邻距离 >= 60;道路覆盖全镇,建筑尽量贴道路。
- 建筑 entrances 给出 1 个:放在建筑朝向最近道路的那条边的中点(系统会自动吸附到道路,给出大致位置即可)。
- spawnPoints 只有 1 个:{"id":"player","position":{两条道路交叉点附近的整点}}。
- npcs 数量为 ${npcCount}:姓氏本地化、职业与建筑对应(茶馆→掌柜、诊所→医生、杂货铺→店主、社区→干事/记者、plaza→邮差/花匠等),traits 互不相同,颜色与职业气质匹配。homeLocations 必须引用存在的建筑 id 且每个 npc 各一个。`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "loc";
}

/** 确定性后处理:吸附入口到最近道路折线、钳制画布、规范化 id(保证寻路可过)。 */
export function reprojectStructure(structureJson: LlmStructureJson): LlmStructureJson {
  const nearestOnPath = (point: { x: number; y: number }, paths: LlmStructureJson["paths"]): { x: number; y: number } => {
    let best: { x: number; y: number; d: number } | null = null;
    for (const path of paths) {
      for (let i = 1; i < path.points.length; i += 1) {
        const a = path.points[i - 1];
        const b = path.points[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lengthSq = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
        const px = a.x + dx * t;
        const py = a.y + dy * t;
        const d = (px - point.x) ** 2 + (py - point.y) ** 2;
        if (!best || d < best.d) best = { x: px, y: py, d };
      }
    }
    if (!best) return { x: 450, y: 310 };
    return { x: Math.round(best.x), y: Math.round(best.y) };
  };
  const paths = structureJson.paths ?? [];
  const locations = (structureJson.locations ?? []).map((location, index) => {
    const width = clamp(location.bounds.width, 60, 140);
    const height = clamp(location.bounds.height, 50, 110);
    const x = clamp(location.bounds.x, 20, CANVAS.width - 20 - width);
    const y = clamp(location.bounds.y, 20, CANVAS.height - 20 - height);
    const snapped = nearestOnPath(location.entrances?.[0] ?? { x: x + width / 2, y: y + height / 2 }, paths);
    return {
      id: `loc_${normId(location.id)}`,
      name: location.name,
      kind: location.kind,
      bounds: { x, y, width, height },
      entrances: [snapped],
      capabilities: location.capabilities?.length ? location.capabilities : ["social"],
    };
  });
  const npcs = (structureJson.npcs ?? []).slice(0, Math.max(3, Math.min(12, 999))).map((npc, index) => ({
    id: `npc_${index}`,
    name: npc.name,
    age: clamp(npc.age, 18, 70),
    role: npc.role,
    color: /^#[0-9a-fA-F]{6}$/.test(npc.color ?? "") ? npc.color : "#8a9a5b",
    personality: npc.personality,
    motivation: npc.motivation,
    preferences: (npc.preferences ?? []).slice(0, 4),
    dislikes: (npc.dislikes ?? []).slice(0, 3),
    traits: {
      sociability: clamp(npc.traits?.sociability ?? 50, 5, 95),
      conscientiousness: clamp(npc.traits?.conscientiousness ?? 50, 5, 95),
      curiosity: clamp(npc.traits?.curiosity ?? 50, 5, 95),
      riskTolerance: clamp(npc.traits?.riskTolerance ?? 50, 5, 95),
    },
  }));
  const homeLocations: Record<string, string> = {};
  const buildingIds = locations.filter((location) => location.kind === "building").map((location) => location.id);
  npcs.forEach((npc, index) => {
    const preferred = buildingIds[index % buildingIds.length] ?? buildingIds[0];
    homeLocations[npc.id] = preferred ?? "plaza";
  });
  const spawn = nearestOnPath(structureJson.spawnPoints?.[0]?.position ?? { x: 450, y: 310 }, paths);
  return {
    name: structureJson.name ?? "新镇子",
    description: structureJson.description ?? "",
    locations,
    paths: paths.map((path, index) => ({
      id: `path_${index + 1}`,
      width: clamp(path.width ?? 20, 14, 26),
      points: (path.points ?? []).slice(0, 12).map((point) => ({ x: clamp(point.x, 0, CANVAS.width), y: clamp(point.y, 0, CANVAS.height) })),
    })),
    spawnPoints: [{ id: "player", position: spawn }],
    npcs,
    homeLocations,
  };
}

export interface LlmStructureInput {
  prompt: string;
  seed: number;
  npcCount: number;
}

export class LlmStructureProvider {
  readonly enabled: boolean;
  readonly providerName = "llm-structure";

  constructor(private readonly ai: SimulationAIProvider) {
    this.enabled = this.ai.enabled;
  }

  async generateStructure(input: LlmStructureInput): Promise<{ structure: WorldStructure; source: "llm" }> {
    const response = await this.ai.completeDecision({
      instructions: buildInstructions(input.npcCount),
      input: { prompt: input.prompt, styleHint: "现代中式滨水小镇,像素游戏俯视地图" },
    });
    const parsed = parseJson(response.rawText);
    const reprojected = reprojectStructure(parsed as LlmStructureJson);
    const structure: WorldStructure = {
      worldId: `world_llm_${input.seed}`,
      name: reprojected.name,
      description: reprojected.description || input.prompt,
      blueprint: {
        schemaVersion: 1,
        worldId: `world_llm_${input.seed}`,
        canvas: { width: CANVAS.width, height: CANVAS.height, tileSize: 10 },
        locations: reprojected.locations,
        paths: reprojected.paths,
        spawnPoints: reprojected.spawnPoints,
      } as WorldBlueprint,
      npcs: reprojected.npcs as unknown as NpcProfile[],
      homeLocations: reprojected.homeLocations,
      rules: { seed: input.seed, worldStartMinute: 8 * 60, weather: "晴" },
    };
    if (structure.blueprint.locations.length < 2) throw new Error("LLM_STRUCTURE_TOO_FEW_LOCATIONS");
    return { structure, source: "llm" };
  }
}


function parseJson(value: string): unknown {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error("LLM_STRUCTURE_INVALID_JSON");
  }
}
