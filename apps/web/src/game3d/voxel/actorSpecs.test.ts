import { describe, expect, it } from "vitest";
import { ACTOR_SPECS, actorSpecFor, fallbackSpec } from "./actorSpecs";
import { buildVoxelActor } from "./buildVoxelActor";

/** 与 apps/web/src/game/TownScene.ts:447-453 的 createPixelAvatar 表逐项对齐:3D 的居民必须还是同一个人。 */
const TWO_D_PALETTE: Record<string, { hair: string; skin: string; accent: string }> = {
  npc_lin_xia: { hair: "#3f2722", skin: "#f2bd91", accent: "#f6d36a" },
  npc_shen_zhiheng: { hair: "#27313a", skin: "#e8b88f", accent: "#eef6f2" },
  npc_he_jianguo: { hair: "#4a4742", skin: "#dba679", accent: "#e3be63" },
  npc_zhou_fang: { hair: "#292b25", skin: "#e7ad7e", accent: "#e86943" },
  npc_tang_yucheng: { hair: "#3a253f", skin: "#efb98d", accent: "#f0cc72" },
};

describe("actorSpecs", () => {
  it("六份规格齐全", () => {
    expect(Object.keys(ACTOR_SPECS).sort()).toEqual([
      "npc_he_jianguo", "npc_lin_xia", "npc_shen_zhiheng", "npc_tang_yucheng", "npc_zhou_fang", "player",
    ]);
  });

  it("5 位居民的肤色/发色/强调色与 2D createPixelAvatar 表逐项相等", () => {
    for (const [id, expected] of Object.entries(TWO_D_PALETTE)) {
      const spec = ACTOR_SPECS[id];
      expect(spec, `${id} 缺少规格`).toBeDefined();
      expect(spec.palette.hair).toBe(expected.hair);
      expect(spec.palette.skin).toBe(expected.skin);
      expect(spec.palette.accent).toBe(expected.accent);
    }
  });

  it("每份规格的五个颜色都是合法 6 位 hex", () => {
    for (const spec of Object.values(ACTOR_SPECS)) {
      for (const color of Object.values(spec.palette)) {
        expect(color, `${spec.id} 的颜色 ${color}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("每份规格都能被 buildVoxelActor 构造成六个非空部件", () => {
    for (const spec of Object.values(ACTOR_SPECS)) {
      const parts = buildVoxelActor(spec);
      expect(parts.map((part) => part.name)).toEqual([
        "head", "torso", "armLeft", "armRight", "legLeft", "legRight",
      ]);
      for (const part of parts) {
        expect(part.voxels.length, `${spec.id} 的 ${part.name} 是空的`).toBeGreaterThan(0);
      }
    }
  });

  it("未知居民回退到 fallbackSpec 并用传入的颜色当衣色", () => {
    const spec = fallbackSpec("npc_newcomer", "#82c2a5");
    expect(spec.id).toBe("npc_newcomer");
    expect(spec.palette.clothing).toBe("#82c2a5");
    expect(buildVoxelActor(spec)).toHaveLength(6);
  });

  it("actorSpecFor 对已知 id 返回内置规格、对未知 id 返回回退规格", () => {
    expect(actorSpecFor("npc_lin_xia", "#000000")).toBe(ACTOR_SPECS.npc_lin_xia);
    expect(actorSpecFor("npc_newcomer", "#82c2a5").id).toBe("npc_newcomer");
  });
});
