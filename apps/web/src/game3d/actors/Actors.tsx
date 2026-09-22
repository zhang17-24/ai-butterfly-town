import { useCallback, useLayoutEffect, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type * as THREE from "three";
import { gameEvents } from "../../game/event-bus";
import { useWorldStore } from "../../state/world-store";
import { actorSpecFor } from "../voxel/actorSpecs";
import type { ActorPose, VoxelActorSpec } from "../voxel/voxelTypes";
import { ActorBody } from "./VoxelActor";
import { useActorPath } from "./useActorPath";

export function Actors() {
  const npcs = useWorldStore((state) => state.npcs);
  const player = useWorldStore((state) => state.player);
  const playerPath = useWorldStore((state) => state.playerPath);

  const select = useCallback((npcId: string) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    gameEvents.dispatchEvent(new CustomEvent("npc:selected", { detail: npcId }));
  }, []);

  return (
    <group>
      {npcs.map((npc) => (
        <ActorNode
          key={npc.profile.id}
          position={npc.state.position}
          path={npc.state.actionPath ?? []}
          spec={actorSpecFor(npc.profile.id, npc.profile.color)}
          onClick={select(npc.profile.id)}
        />
      ))}
      {player && (
        <ActorNode
          position={player.position}
          path={playerPath}
          spec={actorSpecFor("player", "#285f83")}
        />
      )}
    </group>
  );
}

function ActorNode({ position, path, spec, onClick }: {
  position: { x: number; y: number };
  path: { x: number; y: number }[];
  spec: VoxelActorSpec;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const rootRef = useRef<THREE.Group>(null);
  const poseRef = useRef<ActorPose>({ swing: 0 });
  useActorPath({ position, path, isPlayer: !onClick, rootRef, poseRef });

  // 只对齐一次:之后位置由 useActorPath 每帧接管。
  // 不能把 position 当成 JSX prop —— 每次 store 更新都会重渲染并把插值位置拽回服务端值,造成抖动。
  useLayoutEffect(() => {
    rootRef.current?.position.set(position.x, 0, position.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <group ref={rootRef} onClick={onClick}>
      <ActorBody spec={spec} poseRef={poseRef} />
    </group>
  );
}
