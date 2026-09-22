import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { buildVoxelActor } from "../voxel/buildVoxelActor";
import type { ActorPose, VoxelActorSpec, VoxelPart } from "../voxel/voxelTypes";

export const VOXEL_SIZE = 1;

const matrix = new THREE.Matrix4();
const color = new THREE.Color();

/** 单个部件:一个 InstancedMesh,每个体素一个实例,实例色走 instanceColor(一次 draw call)。 */
export function VoxelPartMesh({ part: voxelPart }: { part: VoxelPart }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    voxelPart.voxels.forEach((voxel, index) => {
      matrix.makeTranslation(
        (voxel.x + 0.5) * VOXEL_SIZE,
        (voxel.y + 0.5) * VOXEL_SIZE,
        (voxel.z + 0.5) * VOXEL_SIZE,
      );
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, color.set(voxel.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [voxelPart]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, voxelPart.voxels.length]} castShadow>
      <boxGeometry args={[VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE]} />
      <meshLambertMaterial />
    </instancedMesh>
  );
}

const LIMB_NAMES = ["armLeft", "armRight", "legLeft", "legRight"] as const;

/**
 * 一个完整角色:六个部件各自挂在自己的 pivot 组下,便于绕 pivot 摆动。
 *
 * 摆动必须在 useFrame 里**直接改 group.rotation**,不能把 swing 当 JSX prop 传 ——
 * JSX prop 只在组件重渲染时生效,而逐帧动画不会触发重渲染。
 * 因此在 Actors 层把 swing 写进 poseRef,这里每帧读出来应用到四肢 group 上。
 */
export function ActorBody({ spec, poseRef }: { spec: VoxelActorSpec; poseRef: RefObject<ActorPose> }) {
  const parts = useMemo(() => buildVoxelActor(spec), [spec]);
  const limbRefs = useRef<Record<string, THREE.Group | null>>({});

  useFrame(() => {
    const swing = poseRef.current.swing;
    for (const name of LIMB_NAMES) {
      const group = limbRefs.current[name];
      if (group) group.rotation.x = name.endsWith("Left") ? swing : -swing;
    }
  });

  return (
    <group>
      {parts.map((part) => (
        <group
          key={part.name}
          position={part.pivot}
          ref={(node) => { limbRefs.current[part.name] = node; }}
        >
          <VoxelPartMesh part={part} />
        </group>
      ))}
    </group>
  );
}
