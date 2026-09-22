import { useCallback, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { gameEvents } from "../../game/event-bus";
import { useWorldStore } from "../../state/world-store";
import { actorSpecFor } from "../voxel/actorSpecs";
import { worldToScene } from "../voxel/sceneCoords";
import type { ActorPose } from "../voxel/voxelTypes";
import { ActorBody } from "./VoxelActor";

export function Actors() {
  const npcs = useWorldStore((state) => state.npcs);
  const player = useWorldStore((state) => state.player);
  /** Task 6 先固定不摆动,Task 7 接入 useActorPath 后由它逐帧写入。 */
  const poseRef = useRef<ActorPose>({ swing: 0 });

  const select = useCallback((npcId: string) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    gameEvents.dispatchEvent(new CustomEvent("npc:selected", { detail: npcId }));
  }, []);

  return (
    <group>
      {npcs.map((npc) => {
        const [x, , z] = worldToScene(npc.state.position);
        return (
          <group key={npc.profile.id} position={[x, 0, z]} onClick={select(npc.profile.id)}>
            <ActorBody spec={actorSpecFor(npc.profile.id, npc.profile.color)} poseRef={poseRef} />
          </group>
        );
      })}
      {player && (() => {
        const [x, , z] = worldToScene(player.position);
        return (
          <group position={[x, 0, z]}>
            <ActorBody spec={actorSpecFor("player", "#285f83")} poseRef={poseRef} />
          </group>
        );
      })()}
    </group>
  );
}
