import { useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type { WorldBlueprint } from "@ai-town/shared";
import { GROUND_PALETTE, planGroundQuads, type GroundQuad } from "./groundPlan";
import { sceneToWorld, worldCenter } from "../voxel/sceneCoords";

/**
 * 各层中心高度。**关键约束**:草地基座是一块不透明实体,顶面在 y=0,且覆盖整张地图 ——
 * 所以任何整体位于 y<=0 以下的层都会被基座完全挡住(水面曾因此整条河看不见)。
 * 水面中心取 0:顶面 +0.6 露出基座之上,同时仍低于路面顶面 +0.8,桥面才像跨在河上。
 */
const LAYER_Y: Record<GroundQuad["layer"], number> = { water: 0, plaza: 0.2, road: 0.2 };
const QUAD_THICKNESS = 1.2;
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
