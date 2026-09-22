import { useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import type { WorldBlueprint } from "@ai-town/shared";
import { qixiBlueprint } from "@ai-town/shared/qixi-blueprint";
import { gameEvents } from "../game/event-bus";
import { Actors } from "./actors/Actors";
import { TownScene3D } from "./scene/TownScene3D";
import { worldCenter } from "./voxel/sceneCoords";

export interface Town3DCanvasProps {
  worldId?: string;
  blueprint?: WorldBlueprint;
  mapImageUrl?: string;
  npcSprites?: Record<string, string>;
  walkableVisible: boolean;
}

export function Town3DCanvas({ blueprint }: Town3DCanvasProps) {
  const active = blueprint ?? qixiBlueprint;
  const [cx, , cz] = worldCenter(active.canvas);

  const handleGroundClick = useCallback((world: { x: number; y: number }) => {
    gameEvents.dispatchEvent(new CustomEvent("map:move", { detail: world }));
  }, []);

  return (
    <Canvas
      className="town-canvas-3d"
      dpr={[1, 1.75]}
      shadows
      camera={{ fov: 45, position: [cx, 680, cz + 800], near: 1, far: 3000 }}
    >
      <color attach="background" args={["#1d3b3f"]} />
      <TownScene3D blueprint={active} onGroundClick={handleGroundClick}>
        <Actors />
      </TownScene3D>
    </Canvas>
  );
}
