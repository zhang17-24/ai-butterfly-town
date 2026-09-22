import { useMemo, type ReactNode } from "react";
import { OrbitControls } from "@react-three/drei";
import type { WorldBlueprint } from "@ai-town/shared";
import { Buildings } from "./Buildings";
import { GroundMesh } from "./GroundMesh";
import { Sun } from "./Sun";
import { sunFromGameMinute } from "./sunFromGameMinute";
import { useWorldMinute } from "./useWorldMinute";
import { worldCenter } from "../voxel/sceneCoords";

/** 俯仰夹取:0 = 正上方俯视,π/2 = 贴地平线。上下都留余量,既能看全小镇又不穿到地面以下。 */
const MIN_POLAR = Math.PI * 0.12;
const MAX_POLAR = Math.PI * 0.42;
const MIN_DISTANCE = 140;
/** 不可低于约 1300:900×620 的地图在这个 fov/aspect 下最短需要 ~748 的距离才装得下 620 的进深(带 ~1.75× 余量即 ~1310),再小就永远拉不出全貌。 */
const MAX_DISTANCE = 1700;

export function TownScene3D({ blueprint, children, onGroundClick }: {
  blueprint: WorldBlueprint;
  children?: ReactNode;
  onGroundClick: (world: { x: number; y: number }) => void;
}) {
  const [cx, , cz] = worldCenter(blueprint.canvas);
  // 夜里点亮窗户。在场景层推导而不是从入口组件传下来,省掉一层只为透传的 prop。
  const gameMinute = useWorldMinute();
  const litWindows = useMemo(() => sunFromGameMinute(gameMinute).isNight, [gameMinute]);

  return (
    <>
      <Sun canvas={blueprint.canvas} />
      <OrbitControls
        makeDefault
        target={[cx, 0, cz]}
        minPolarAngle={MIN_POLAR}
        maxPolarAngle={MAX_POLAR}
        minDistance={MIN_DISTANCE}
        maxDistance={MAX_DISTANCE}
        enablePan
        screenSpacePanning={false}
      />
      <GroundMesh blueprint={blueprint} onGroundClick={onGroundClick} />
      <Buildings blueprint={blueprint} litWindows={litWindows} />
      {children}
    </>
  );
}
