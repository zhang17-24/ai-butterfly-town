import { useCallback, useMemo } from "react";
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

/** 低端设备(小屏 / 少核心)自动降级:关阴影、压 DPR 上限。 */
function useQualityTier(): "full" | "lite" {
  return useMemo(() => {
    if (typeof window === "undefined") return "full";
    const cores = navigator.hardwareConcurrency ?? 4;
    const small = window.matchMedia("(max-width: 820px)").matches;
    return cores <= 4 || small ? "lite" : "full";
  }, []);
}

export function Town3DCanvas({ blueprint, walkableVisible }: Town3DCanvasProps) {
  const active = blueprint ?? qixiBlueprint;
  const [cx, , cz] = worldCenter(active.canvas);
  const tier = useQualityTier();

  const handleGroundClick = useCallback((world: { x: number; y: number }) => {
    gameEvents.dispatchEvent(new CustomEvent("map:move", { detail: world }));
  }, []);

  return (
    <Canvas
      className="town-canvas-3d"
      dpr={tier === "lite" ? [1, 1.25] : [1, 1.75]}
      shadows={tier === "full"}
      camera={{ fov: 45, position: [cx, 680, cz + 800], near: 1, far: 3000 }}
    >
      <color attach="background" args={["#1d3b3f"]} />
      <TownScene3D blueprint={active} onGroundClick={handleGroundClick} walkableVisible={walkableVisible}>
        <Actors />
      </TownScene3D>
    </Canvas>
  );
}
