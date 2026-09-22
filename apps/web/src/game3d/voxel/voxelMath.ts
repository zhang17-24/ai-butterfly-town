import type { Voxel } from "./voxelTypes";

/** 按百分比压暗 hex 颜色,用于从主色推导裤腿等次级色(与 2D 的 darken(30) 同语义)。 */
export function darkenHex(hex: string, amount: number): string {
  const factor = Math.max(0, Math.min(100, amount)) / 100;
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
  return `#${channels.map((channel) => Math.round(channel * (1 - factor)).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * 只保留至少有一个面暴露的体素。六邻域全被占的体素对渲染毫无贡献,剔掉能省一个数量级。
 * 只在单个 part 内部做,不跨 part —— 否则手臂摆开时会露出被剔掉的躯干空洞。
 */
export function cullInteriorVoxels(voxels: Voxel[]): Voxel[] {
  const occupied = new Set(voxels.map((voxel) => `${voxel.x},${voxel.y},${voxel.z}`));
  return voxels.filter((voxel) => !(
    occupied.has(`${voxel.x + 1},${voxel.y},${voxel.z}`)
    && occupied.has(`${voxel.x - 1},${voxel.y},${voxel.z}`)
    && occupied.has(`${voxel.x},${voxel.y + 1},${voxel.z}`)
    && occupied.has(`${voxel.x},${voxel.y - 1},${voxel.z}`)
    && occupied.has(`${voxel.x},${voxel.y},${voxel.z + 1}`)
    && occupied.has(`${voxel.x},${voxel.y},${voxel.z - 1}`)
  ));
}
