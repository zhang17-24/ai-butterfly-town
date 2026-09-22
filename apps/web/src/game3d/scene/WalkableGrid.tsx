import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { WorldBlueprint } from "@ai-town/shared";
import { planWalkableCells } from "./walkablePlan";

/** 抬到所有地面层之上(路面顶面 +0.305),否则叠加层会被路面盖住。 */
const CELL_Y = 1.4;
const MARKER_SIZE = 16;
const MARKER_THICKNESS = 0.4;
const matrix = new THREE.Matrix4();

/**
 * 可走范围叠加层。
 *
 * **用薄长方体而不是平面**:平面要躺平就得给 instancedMesh 加 rotation-x,
 * 而那个旋转会连同每个实例的**平移**一起旋转 —— 格子的 z 会被转成高度,
 * 整片叠加层变成一面立在远处的墙(实测就是这样)。长方体不需要任何旋转。
 */
export function WalkableGrid({ blueprint, visible }: { blueprint: WorldBlueprint; visible: boolean }) {
  const cells = useMemo(() => planWalkableCells(blueprint), [blueprint]);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    cells.forEach((cell, index) => {
      matrix.makeTranslation(cell.x, CELL_Y, cell.z);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [cells]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, cells.length]} visible={visible}>
      <boxGeometry args={[MARKER_SIZE, MARKER_THICKNESS, MARKER_SIZE]} />
      <meshBasicMaterial color="#00d4ff" transparent opacity={0.45} depthWrite={false} />
    </instancedMesh>
  );
}
