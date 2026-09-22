import { describe, expect, it } from "vitest";
import { cullInteriorVoxels, darkenHex } from "./voxelMath";
import type { Voxel } from "./voxelTypes";

function solid(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Voxel[] {
  const voxels: Voxel[] = [];
  for (let x = x0; x <= x1; x += 1)
    for (let y = y0; y <= y1; y += 1)
      for (let z = z0; z <= z1; z += 1)
        voxels.push({ x, y, z, color: "#000000" });
  return voxels;
}

describe("darkenHex", () => {
  it("按百分比压暗每个通道", () => {
    expect(darkenHex("#808080", 30)).toBe("#5a5a5a");
    expect(darkenHex("#ffffff", 50)).toBe("#808080");
    expect(darkenHex("#194f59", 0)).toBe("#194f59");
  });

  it("黑色压暗后仍是黑色,不会变成负数", () => {
    expect(darkenHex("#000000", 90)).toBe("#000000");
  });
});

describe("cullInteriorVoxels", () => {
  it("3×3×3 实心块只剩外层 26 个", () => {
    expect(cullInteriorVoxels(solid(0, 2, 0, 2, 0, 2))).toHaveLength(26);
  });

  it("2×2×2 实心块没有内部体素,一个都不剔", () => {
    expect(cullInteriorVoxels(solid(0, 1, 0, 1, 0, 1))).toHaveLength(8);
  });

  it("单个体素保留", () => {
    expect(cullInteriorVoxels(solid(0, 0, 0, 0, 0, 0))).toHaveLength(1);
  });

  it("两个相邻体素各自有暴露面,都保留", () => {
    expect(cullInteriorVoxels([{ x: 0, y: 0, z: 0, color: "#000" }, { x: 1, y: 0, z: 0, color: "#000" }])).toHaveLength(2);
  });

  it("空输入返回空数组", () => {
    expect(cullInteriorVoxels([])).toEqual([]);
  });

  it("保留体素的颜色不被改动", () => {
    const culled = cullInteriorVoxels(solid(0, 2, 0, 2, 0, 2));
    expect(culled.every((voxel) => voxel.color === "#000000")).toBe(true);
  });
});
