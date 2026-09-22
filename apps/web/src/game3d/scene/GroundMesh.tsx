import { useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type { WorldBlueprint } from "@ai-town/shared";
import { GROUND_PALETTE, planGroundQuads, type GroundQuad } from "./groundPlan";
import { sceneToWorld, worldCenter } from "../voxel/sceneCoords";

/**
 * 各层中心高度与厚度。两个**必须同时成立**的约束:
 *
 * 1. 草地基座是不透明实体,顶面在 y = 0,且覆盖整张地图 —— 任何整体位于 y <= 0 以下的层
 *    都会被基座完全挡住(水面曾因此整条河看不见)。所以水必须露在 y = 0 之上。
 * 2. 角色站在 y = 0 的地平面上(体素原点在脚底)。层越厚,角色走在路面上陷得越深 ——
 *    层顶超过约 0.3 就会吃掉脚部那一格体素。所以层要做薄:所有层顶面 <= 0.31。
 *
 * 取 QUAD_THICKNESS = 0.25、水面中心 0.05、路面中心 0.18,于是:
 *   水面 y ∈ [-0.075, +0.175](露出基座之上)
 *   路面/广场 y ∈ [+0.055, +0.305](顶面高过水面,桥面才像跨在河上)
 * 面平面互不重合({-6, -0.075, 0.055, 0.175, 0.305}),不会 z-fighting。
 */
const LAYER_Y: Record<GroundQuad["layer"], number> = { water: 0.05, plaza: 0.18, road: 0.18 };
const QUAD_THICKNESS = 0.25;
const BASE_THICKNESS = 6;

export function GroundMesh({ blueprint, onGroundClick }: {
  blueprint: WorldBlueprint;
  onGroundClick: (world: { x: number; y: number }) => void;
}) {
  const quads = useMemo(() => planGroundQuads(blueprint), [blueprint]);
  const [cx, , cz] = worldCenter(blueprint.canvas);
  const { width, height } = blueprint.canvas;

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onGroundClick(sceneToWorld(event.point.x, event.point.z));
  };

  return (
    <group>
      <mesh position={[cx, -BASE_THICKNESS / 2, cz]} receiveShadow onClick={handleClick}>
        <boxGeometry args={[width, BASE_THICKNESS, height]} />
        <meshLambertMaterial color={GROUND_PALETTE.grass} />
      </mesh>
      {quads.map((quad, index) => (
        <mesh
          key={`${quad.layer}-${index}`}
          position={[quad.x, LAYER_Y[quad.layer], quad.z]}
          rotation-y={quad.rotationY}
          receiveShadow
          onClick={handleClick}
        >
          <boxGeometry args={[quad.width, QUAD_THICKNESS, quad.length]} />
          <meshLambertMaterial color={quad.color} />
        </mesh>
      ))}
    </group>
  );
}
