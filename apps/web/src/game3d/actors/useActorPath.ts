import { useEffect, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Position } from "@ai-town/shared";
import {
  MAX_PLAYER_SEGMENT_MS, MAX_SEGMENT_MS, MIN_PLAYER_SEGMENT_MS, MIN_SEGMENT_MS,
  PLAYER_SPEED_PER_UNIT, resumePath, segmentDurationMs, WALK_SPEED_PER_UNIT,
} from "./pathPlayback";
import { yawFromSegment } from "../voxel/sceneCoords";
import type { ActorPose } from "../voxel/voxelTypes";

/** 走路摆动频率(弧度/秒)与幅度(弧度)。 */
const SWING_RATE = 11;
const SWING_AMPLITUDE = 0.55;
/** 没有路径时朝服务端权威位置收敛的速率(每秒收敛比例)。 */
const CATCH_UP_RATE = 2.2;

/**
 * 沿服务端路径回放角色位移。
 *
 * **关键**:位置与朝向直接写到场景对象上(rootRef 的 group),不经过 React 状态 ——
 * 逐帧动画不会触发重渲染,把逐帧值当 JSX prop 传是无效的。swing 同样写进 poseRef,
 * 由 ActorBody 自己的 useFrame 读取后应用到四肢。
 */
export function useActorPath({ position, path, isPlayer, rootRef, poseRef }: {
  position: Position;
  path: Position[];
  isPlayer: boolean;
  rootRef: RefObject<THREE.Group | null>;
  poseRef: RefObject<ActorPose>;
}): void {
  const queue = useRef<Position[]>([]);
  const legElapsed = useRef(0);
  const key = useRef<string>("");
  const current = useRef<Position>({ x: position.x, y: position.y });
  const yaw = useRef(0);

  // 新路径到达:从当前渲染位置续接后重建队列
  const pathKey = path.length > 1 ? path.map((point) => `${point.x},${point.y}`).join("|") : "";
  useEffect(() => {
    if (pathKey === key.current) return;
    key.current = pathKey;
    queue.current = path.length > 1 ? resumePath(current.current, path) : [];
  }, [pathKey, path]);

  useFrame((_state, delta) => {
    const dt = Math.min(delta, 0.05);
    const queueHead = queue.current[0];

    if (!queueHead) {
      // 无路径:朝服务端权威位置平滑收敛(跳过时间/刷新恢复后的位置跳变走这里)
      const dx = position.x - current.current.x;
      const dz = position.y - current.current.y;
      const distance = Math.hypot(dx, dz);
      if (distance > 1) {
        const step = distance * Math.min(1, dt * CATCH_UP_RATE);
        current.current.x += (dx / distance) * step;
        current.current.y += (dz / distance) * step;
        yaw.current = yawFromSegment(current.current, position);
        poseRef.current.swing = Math.sin((legElapsed.current += dt * SWING_RATE)) * SWING_AMPLITUDE;
      } else {
        current.current.x = position.x;
        current.current.y = position.y;
        poseRef.current.swing = 0;
      }
    } else {
      const dx = queueHead.x - current.current.x;
      const dz = queueHead.y - current.current.y;
      const distance = Math.hypot(dx, dz);
      if (distance <= 0.5) {
        current.current.x = queueHead.x;
        current.current.y = queueHead.y;
        queue.current = queue.current.slice(1);
        if (queue.current.length === 0) poseRef.current.swing = 0;
      } else {
        const duration = segmentDurationMs(
          current.current, queueHead,
          isPlayer ? MIN_PLAYER_SEGMENT_MS : MIN_SEGMENT_MS,
          isPlayer ? MAX_PLAYER_SEGMENT_MS : MAX_SEGMENT_MS,
          isPlayer ? PLAYER_SPEED_PER_UNIT : WALK_SPEED_PER_UNIT,
        );
        const step = Math.min(distance, (distance / (duration / 1000)) * dt);
        current.current.x += (dx / distance) * step;
        current.current.y += (dz / distance) * step;
        yaw.current = yawFromSegment(current.current, queueHead);
        poseRef.current.swing = Math.sin((legElapsed.current += dt * SWING_RATE)) * SWING_AMPLITUDE;
      }
    }

    const root = rootRef.current;
    if (!root) return;
    root.position.x = current.current.x;
    root.position.z = current.current.y;
    root.rotation.y = yaw.current;
  });
}
