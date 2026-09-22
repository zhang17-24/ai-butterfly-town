import type { ActorProportions, VoxelActorSpec } from "./voxelTypes";

/** 默认体型:沿用 2D「头身比约 1:2 的生活模拟像素居民」的游戏化比例,总高 28 体素。 */
const DEFAULT_PROPORTIONS: ActorProportions = {
  width: 10,
  depth: 6,
  headHeight: 8,
  torsoHeight: 10,
  legHeight: 10,
  armHeight: 9,
};

const SHOES = "#342f35";

export const ACTOR_SPECS: Record<string, VoxelActorSpec> = {
  npc_lin_xia: {
    id: "npc_lin_xia",
    proportions: DEFAULT_PROPORTIONS,
    palette: { clothing: "#d8684d", skin: "#f2bd91", hair: "#3f2722", accent: "#f6d36a", shoes: SHOES },
    accessories: [],
  },
  npc_shen_zhiheng: {
    id: "npc_shen_zhiheng",
    proportions: DEFAULT_PROPORTIONS,
    palette: { clothing: "#2d8184", skin: "#e8b88f", hair: "#27313a", accent: "#eef6f2", shoes: SHOES },
    // 白大褂:躯干两侧各加一片白色外壳(x 在躯干外侧相邻一格)
    accessories: [
      { part: "torso", at: [-6, 10, -2], size: [1, 10, 5], color: "#eef6f2" },
      { part: "torso", at: [5, 10, -2], size: [1, 10, 5], color: "#eef6f2" },
    ],
  },
  npc_he_jianguo: {
    id: "npc_he_jianguo",
    proportions: DEFAULT_PROPORTIONS,
    palette: { clothing: "#7c5141", skin: "#dba679", hair: "#4a4742", accent: "#e3be63", shoes: SHOES },
    accessories: [],
  },
  npc_zhou_fang: {
    id: "npc_zhou_fang",
    proportions: DEFAULT_PROPORTIONS,
    palette: { clothing: "#425b49", skin: "#e7ad7e", hair: "#292b25", accent: "#e86943", shoes: SHOES },
    // 挎包:右胯外侧的小块
    accessories: [{ part: "torso", at: [5, 10, -1], size: [3, 5, 4], color: "#c85a3c" }],
  },
  npc_tang_yucheng: {
    id: "npc_tang_yucheng",
    proportions: DEFAULT_PROPORTIONS,
    palette: { clothing: "#194f59", skin: "#efb98d", hair: "#3a253f", accent: "#f0cc72", shoes: SHOES },
    // 相机:胸前一块(躯干正面 z1 = 2,z=3 是正前方一格) + 镜片色
    accessories: [
      { part: "torso", at: [-2, 15, 3], size: [4, 3, 1], color: "#3c4148" },
      { part: "torso", at: [0, 16, 4], size: [1, 1, 1], color: "#9bd2d0" },
    ],
  },
  player: {
    id: "player",
    proportions: DEFAULT_PROPORTIONS,
    palette: { clothing: "#285f83", skin: "#f2bd91", hair: "#27313a", accent: "#68d5ff", shoes: SHOES },
    accessories: [],
  },
};

/** 未知 NPC(动态生成世界)的兜底规格:用 profile.color 当衣色。 */
export function fallbackSpec(id: string, color: string): VoxelActorSpec {
  return {
    id,
    proportions: DEFAULT_PROPORTIONS,
    palette: { clothing: color, skin: "#e8b184", hair: "#352a28", accent: "#f2ce72", shoes: SHOES },
    accessories: [],
  };
}

export function actorSpecFor(id: string, color: string): VoxelActorSpec {
  return ACTOR_SPECS[id] ?? fallbackSpec(id, color);
}
