import {
  PixelStyleSpecSchema,
  WorldBlueprintSchema,
  type PixelStyleSpec,
  type WorldBlueprint,
} from "./index.js";

export const qixiPixelStyle: PixelStyleSpec = PixelStyleSpecSchema.parse({
  id: "qixi-riverside-pixel-v1",
  label: "栖溪暖色滨河像素风",
  projection: "top_down_90",
  pixelScale: 3,
  palette: ["#194f59", "#2d8184", "#82c2a5", "#efe2bc", "#c79463", "#7c5141", "#d8684d", "#425b49"],
  lighting: "温暖的周末午后，阴影短而一致",
  buildingLanguage: "现代滨河社区的矩形建筑，入口清晰，重点室内使用开墙剖切",
  characterLanguage: "头身比约 1:2 的生活模拟像素居民，轮廓与职业配色清楚",
  locked: true,
});

export const qixiBlueprint: WorldBlueprint = WorldBlueprintSchema.parse({
  schemaVersion: 1,
  worldId: "world_qixi_town",
  canvas: { width: 900, height: 620, tileSize: 20 },
  locations: [
    { id: "cafe", name: "栖岸咖啡馆", kind: "building", bounds: { x: 0, y: 0, width: 255, height: 235 }, entrances: [{ x: 238, y: 190 }], capabilities: ["eat", "work", "social"] },
    { id: "clinic", name: "安宁诊所", kind: "building", bounds: { x: 680, y: 0, width: 220, height: 175 }, entrances: [{ x: 730, y: 170 }], capabilities: ["health", "safety", "work"] },
    { id: "grocery", name: "老何杂货铺", kind: "building", bounds: { x: 0, y: 295, width: 190, height: 205 }, entrances: [{ x: 176, y: 430 }], capabilities: ["buy", "work", "social"] },
    { id: "community", name: "社区中心", kind: "building", bounds: { x: 680, y: 220, width: 220, height: 185 }, entrances: [{ x: 690, y: 350 }], capabilities: ["public_info", "work", "social"] },
    { id: "apartment", name: "栖溪公寓", kind: "building", bounds: { x: 575, y: 415, width: 325, height: 205 }, entrances: [{ x: 675, y: 500 }], capabilities: ["rest", "social"] },
    { id: "riverside", name: "河岸市集广场", kind: "plaza", bounds: { x: 445, y: 115, width: 230, height: 300 }, entrances: [{ x: 480, y: 300 }, { x: 650, y: 315 }], capabilities: ["social", "public_info"] },
    { id: "river", name: "栖溪", kind: "water", bounds: { x: 280, y: 0, width: 220, height: 620 }, entrances: [], capabilities: [] },
  ],
  paths: [
    { id: "west-bank", width: 42, points: [{ x: 265, y: 40 }, { x: 265, y: 250 }, { x: 260, y: 560 }] },
    { id: "east-bank", width: 48, points: [{ x: 545, y: 30 }, { x: 540, y: 300 }, { x: 540, y: 560 }] },
    { id: "bridge", width: 54, points: [{ x: 250, y: 285 }, { x: 535, y: 285 }] },
    { id: "east-loop", width: 44, points: [{ x: 540, y: 300 }, { x: 725, y: 300 }, { x: 725, y: 520 }] },
  ],
  spawnPoints: [
    { id: "player", position: { x: 520, y: 350 } },
    { id: "market", position: { x: 580, y: 260 } },
  ],
});
