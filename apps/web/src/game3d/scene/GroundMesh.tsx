import { useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type { WorldBlueprint } from "@ai-town/shared";
import { GROUND_PALETTE, planGroundQuads, type GroundQuad } from "./groundPlan";
import { sceneToWorld, worldCenter } from "../voxel/sceneCoords";

/** 各层离地高度:水面下陷,路面与广场微微抬起避免与基座 z-fighting。 */
const LAYER_Y: Record<GroundQuad["layer"], number> = { water: -1.1, plaza: 0.2, road: 0.2 };
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
