import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { sunFromGameMinute } from "./sunFromGameMinute";
import { useWorldMinute } from "./useWorldMinute";

const DISTANCE = 900;
/** 阴影正交相机半宽:要盖住整张地图(半对角 ~546),再留点余量。 */
const SHADOW_SPAN_FACTOR = 0.75;

/** 世界时间驱动方向光:方位角决定影子方向,高度角决定强度与色温。 */
export function Sun({ canvas }: { canvas: { width: number; height: number } }) {
  const gameMinute = useWorldMinute();
  const sun = useMemo(() => sunFromGameMinute(gameMinute), [gameMinute]);

  const lightRef = useRef<THREE.DirectionalLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);

  /*
   * 方向光的照射方向是「光的 position → 光的 target」,而 target 默认在世界原点 ——
   * 那正是地图的西北角。不把 target 钉到地图中心,阴影正交相机就会以错误的轴为中心,
   * 地图大部分落在视锥之外,于是整张地图一个影子都没有。
   */
  useLayoutEffect(() => {
    const light = lightRef.current;
    const target = targetRef.current;
    if (!light || !target) return;
    light.target = target;
    light.target.updateMatrixWorld();
  });

  const azimuth = (sun.azimuthDeg * Math.PI) / 180;
  // 夜间高度角为负:抬到地平线以上一点点,免得方向光从地底打上来
  const elevation = (Math.max(sun.elevationDeg, 6) * Math.PI) / 180;
  const horizontal = Math.cos(elevation) * DISTANCE;
  const centerX = canvas.width / 2;
  const centerZ = canvas.height / 2;
  const position: [number, number, number] = [
    centerX + Math.cos(azimuth) * horizontal,
    Math.sin(elevation) * DISTANCE,
    centerZ + Math.sin(azimuth) * horizontal,
  ];
  const span = Math.max(canvas.width, canvas.height) * SHADOW_SPAN_FACTOR;

  return (
    <>
      <ambientLight intensity={sun.ambientIntensity} color={sun.ambientColor} />
      <hemisphereLight intensity={sun.isNight ? 0.2 : 0.35} color={sun.color} groundColor="#425b49" />
      <object3D ref={targetRef} position={[centerX, 0, centerZ]} />
      <directionalLight
        ref={lightRef}
        position={position}
        intensity={sun.isNight ? 0.3 : sun.intensity}
        color={sun.isNight ? "#8fa6d8" : sun.color}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-near={1}
        shadow-camera-far={DISTANCE * 2.2}
        shadow-bias={-0.0008}
      />
      <pointLight position={[centerX, 60, centerZ]} intensity={sun.isNight ? 0.35 : 0} color="#f0cc72" distance={520} />
    </>
  );
}
