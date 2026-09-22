import { describe, expect, it } from "vitest";
import { actorHeight, buildVoxelActor } from "./buildVoxelActor";
import { darkenHex } from "./voxelMath";
import type { VoxelActorSpec } from "./voxelTypes";

const spec: VoxelActorSpec = {
  id: "npc_test",
  palette: { clothing: "#d8684d", skin: "#f2bd91", hair: "#3f2722", accent: "#f6d36a", shoes: "#342f35" },
  proportions: { width: 10, depth: 6, headHeight: 8, torsoHeight: 10, legHeight: 10, armHeight: 9 },
  accessories: [],
};

describe("buildVoxelActor", () => {
  it("生成六个部件", () => {
    const names = buildVoxelActor(spec).map((part) => part.name);
    expect(names).toEqual(["head", "torso", "armLeft", "armRight", "legLeft", "legRight"]);
  });

  it("每个部件都非空且没有内部体素", () => {
    for (const part of buildVoxelActor(spec)) {
      expect(part.voxels.length).toBeGreaterThan(0);
      const keys = new Set(part.voxels.map((voxel) => `${voxel.x},${voxel.y},${voxel.z}`));
      for (const voxel of part.voxels) {
        const neighbours = [
          `${voxel.x + 1},${voxel.y},${voxel.z}`, `${voxel.x - 1},${voxel.y},${voxel.z}`,
          `${voxel.x},${voxel.y + 1},${voxel.z}`, `${voxel.x},${voxel.y - 1},${voxel.z}`,
          `${voxel.x},${voxel.y},${voxel.z + 1}`, `${voxel.x},${voxel.y},${voxel.z - 1}`,
        ];
        expect(neighbours.every((key) => keys.has(key))).toBe(false);
      }
    }
  });

  it("头在躯干之上,腿在躯干之下,顺序不重叠", () => {
    const parts = buildVoxelActor(spec);
    const top = (name: string) => {
      const part = parts.find((item) => item.name === name)!;
      return part.pivot[1] + Math.max(...part.voxels.map((voxel) => voxel.y));
    };
    const bottom = (name: string) => {
      const part = parts.find((item) => item.name === name)!;
      return part.pivot[1] + Math.min(...part.voxels.map((voxel) => voxel.y));
    };
    expect(bottom("head")).toBeGreaterThan(top("torso"));
    expect(bottom("torso")).toBeGreaterThan(top("legLeft"));
    expect(top("legRight")).toBeLessThan(bottom("torso"));
  });

  it("双腿左右分居 x 轴两侧且中间留缝", () => {
    const parts = buildVoxelActor(spec);
    const left = parts.find((part) => part.name === "legLeft")!;
    const right = parts.find((part) => part.name === "legRight")!;
    const maxX = (part: typeof left) => Math.max(...part.voxels.map((voxel) => voxel.x)) + part.pivot[0];
    const minX = (part: typeof left) => Math.min(...part.voxels.map((voxel) => voxel.x)) + part.pivot[0];
    expect(maxX(left)).toBeLessThan(minX(right));
  });

  it("四肢的铰点落在肩部与髋部,便于绕其摆动", () => {
    const parts = buildVoxelActor(spec);
    const shoulderY = spec.proportions.legHeight + spec.proportions.torsoHeight - 1;
    const hipY = spec.proportions.legHeight - 1;
    for (const name of ["armLeft", "armRight"] as const) {
      expect(parts.find((item) => item.name === name)!.pivot[1]).toBe(shoulderY);
    }
    for (const name of ["legLeft", "legRight"] as const) {
      expect(parts.find((item) => item.name === name)!.pivot[1]).toBe(hipY);
    }
  });

  it("四肢体素是相对各自铰点的偏移(铰点处为 0)", () => {
    const parts = buildVoxelActor(spec);
    for (const name of ["armLeft", "armRight", "legLeft", "legRight"] as const) {
      const part = parts.find((item) => item.name === name)!;
      // 铰点一定是该部件体素的最高处(肩膀/髋在顶端,肢体向下延伸)
      expect(Math.max(...part.voxels.map((voxel) => voxel.y))).toBe(0);
    }
  });

  it("颜色只用调色板里的值,或由调色板色压暗推导出的次级色", () => {
    const allowed = new Set<string>(Object.values(spec.palette));
    // 裤腿用 darkenHex(clothing, 30) 推导(与 2D createPixelAvatar 的 darken(30) 同语义),
    // 所以合法性判断必须包含"调色板色的 30% 压暗结果",否则会误判这条设计为违规。
    const derived = new Set<string>(Object.values(spec.palette).map((color) => darkenHex(color, 30)));
    for (const part of buildVoxelActor(spec)) {
      for (const voxel of part.voxels) {
        expect(allowed.has(voxel.color) || derived.has(voxel.color)).toBe(true);
      }
    }
  });

  it("配件被附加到指定部件上", () => {
    // 用一个躯干本身绝对不会出现的颜色,否则"加配件前没有该色"这条断言会被躯干原有的胸襟条纹撞掉
    const accessoryColor = "#ff00ff";
    const withAccessory = buildVoxelActor({
      ...spec,
      accessories: [{ part: "torso", at: [0, 2, -4], size: [6, 4, 1], color: accessoryColor }],
    });
    const torso = withAccessory.find((part) => part.name === "torso")!;
    expect(torso.voxels.some((voxel) => voxel.color === accessoryColor)).toBe(true);
    const plain = buildVoxelActor(spec).find((part) => part.name === "torso")!;
    expect(plain.voxels.some((voxel) => voxel.color === accessoryColor)).toBe(false);
  });

  it("身高等于腿 + 躯干 + 头", () => {
    expect(actorHeight(spec)).toBe(10 + 10 + 8);
  });
});
