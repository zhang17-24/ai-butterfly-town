import { useMemo } from "react";
import * as THREE from "three";
import type { WorldBlueprint } from "@ai-town/shared";
import { BUILDING_PALETTE, planBuildingMasses, type BuildingMass } from "./buildingPlan";

const DOOR_HEIGHT = 14;
const DOOR_WIDTH = 12;
const WINDOW_SIZE = 8;
const WINDOW_SPACING = 40;
const ROOF_OVERHANG = 8;
const ROOF_THICKNESS = 4;

export function Buildings({ blueprint, litWindows }: { blueprint: WorldBlueprint; litWindows: boolean }) {
  const masses = useMemo(() => planBuildingMasses(blueprint), [blueprint]);
  return (
    <group>
      {masses.map((mass) => (
        mass.kind === "plaza"
          ? <Plaza key={mass.id} mass={mass} />
          : <Building key={mass.id} mass={mass} litWindows={litWindows} />
      ))}
    </group>
  );
}

function Plaza({ mass }: { mass: BuildingMass }) {
  return (
    <mesh position={[mass.x, mass.height / 2, mass.z]} receiveShadow>
      <boxGeometry args={[mass.width, mass.height, mass.depth]} />
      <meshLambertMaterial color={BUILDING_PALETTE.wall} />
    </mesh>
  );
}

function Building({ mass, litWindows }: { mass: BuildingMass; litWindows: boolean }) {
  /** 沿正 z 面(默认相机方位那一侧)铺开的窗户。 */
  const windows = useMemo(() => {
    const count = Math.max(1, Math.floor(mass.width / WINDOW_SPACING));
    const step = mass.width / (count + 1);
    return Array.from({ length: count }, (_, index) => mass.x - mass.width / 2 + step * (index + 1));
  }, [mass.width, mass.x]);

  return (
    <group>
      {/* 墙体 */}
      <mesh position={[mass.x, mass.height / 2, mass.z]} castShadow receiveShadow>
        <boxGeometry args={[mass.width, mass.height, mass.depth]} />
        <meshLambertMaterial color={BUILDING_PALETTE.wall} />
      </mesh>
      {/* 屋顶:比墙体略大一圈的压顶 */}
      <mesh position={[mass.x, mass.height + ROOF_THICKNESS / 2, mass.z]} castShadow>
        <boxGeometry args={[mass.width + ROOF_OVERHANG, ROOF_THICKNESS, mass.depth + ROOF_OVERHANG]} />
        <meshLambertMaterial color={BUILDING_PALETTE.roof} />
      </mesh>
      {/* 入口:每扇门放在 blueprint 给的 entrance 坐标上,并沿"从建筑中心指向入口"的方向外移一点。
          这样东/南/西/北四个面的入口都能落在正确的立面上(community 的入口在西侧)。 */}
      {mass.doors.map((door, index) => {
        const facing = Math.atan2(door.x - mass.x, door.z - mass.z);
        const outward = { x: door.x + Math.sin(facing) * 1.2, z: door.z + Math.cos(facing) * 1.2 };
        return (
          <mesh key={`door-${index}`} position={[outward.x, DOOR_HEIGHT / 2, outward.z]} rotation-y={facing}>
            <boxGeometry args={[DOOR_WIDTH, DOOR_HEIGHT, 1.2]} />
            <meshLambertMaterial color={BUILDING_PALETTE.door} />
          </mesh>
        );
      })}
      {/* 窗:夜间自发光 */}
      {windows.map((x, index) => (
        <mesh key={`window-${index}`} position={[x, mass.height * 0.62, mass.z + mass.depth / 2 + 0.6]}>
          <boxGeometry args={[WINDOW_SIZE, WINDOW_SIZE, 1.2]} />
          <meshLambertMaterial
            color={BUILDING_PALETTE.window}
            emissive={new THREE.Color(litWindows ? "#f0cc72" : "#000000")}
            emissiveIntensity={litWindows ? 1.1 : 0}
          />
        </mesh>
      ))}
    </group>
  );
}
