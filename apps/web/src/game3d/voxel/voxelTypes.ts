export interface Voxel {
  x: number;
  y: number;
  z: number;
  color: string;
}

export type VoxelPartName = "head" | "torso" | "armLeft" | "armRight" | "legLeft" | "legRight";

export interface VoxelPart {
  name: VoxelPartName;
  /** 该 part 的旋转铰点在角色局部坐标中的位置。 */
  pivot: [number, number, number];
  /** 相对 pivot 的体素偏移。 */
  voxels: Voxel[];
}

export interface Accessory {
  part: VoxelPartName;
  at: [number, number, number];
  size: [number, number, number];
  color: string;
}

export interface ActorPalette {
  clothing: string;
  skin: string;
  hair: string;
  accent: string;
  shoes: string;
}

export interface ActorProportions {
  width: number;
  depth: number;
  headHeight: number;
  torsoHeight: number;
  legHeight: number;
  armHeight: number;
}

export interface VoxelActorSpec {
  id: string;
  palette: ActorPalette;
  proportions: ActorProportions;
  accessories: Accessory[];
}

/**
 * 逐帧动画姿态。只放**需要每帧变化**的字段 —— 位置与朝向由 useActorPath 直接写到
 * 场景对象上(改对象属性不触发 React 重渲染),swing 通过 ref 传给 ActorBody 的 useFrame。
 */
export interface ActorPose {
  swing: number;
}
