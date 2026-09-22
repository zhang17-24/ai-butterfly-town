import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type * as THREE from "three";
import { gameEvents } from "../../game/event-bus";
import { SPEECH_PLAYER_ACTOR, type SpeechLine } from "../../game/speech-events";
import { useWorldStore } from "../../state/world-store";
import { actorSpecFor } from "../voxel/actorSpecs";
import { actorHeight } from "../voxel/buildVoxelActor";
import type { ActorPose, VoxelActorSpec } from "../voxel/voxelTypes";
import { ActorBubble, ActorLabel } from "../ui/ActorLabels";
import { clipBubbleText } from "../ui/bubbleText";
import { ActorBody } from "./VoxelActor";
import { useActorPath } from "./useActorPath";

const BUBBLE_HOLD_MS = 2600;

export function Actors() {
  const npcs = useWorldStore((state) => state.npcs);
  const player = useWorldStore((state) => state.player);
  const playerPath = useWorldStore((state) => state.playerPath);
  const [bubbles, setBubbles] = useState<Record<string, string>>({});

  const playerId = player?.id ?? null;
  useEffect(() => {
    const onSpeak = (event: Event) => {
      const detail = (event as CustomEvent<SpeechLine>).detail;
      if (typeof detail?.actorId !== "string" || typeof detail?.text !== "string") return;
      // 玩家台词的服务端 actor 标记是 SPEECH_PLAYER_ACTOR,本地也可能是 player id
      const actorId = detail.actorId === SPEECH_PLAYER_ACTOR || detail.actorId === playerId
        ? (playerId ?? "player")
        : detail.actorId;
      setBubbles((current) => ({ ...current, [actorId]: clipBubbleText(detail.text) }));
      window.setTimeout(() => {
        setBubbles((current) => {
          const next = { ...current };
          delete next[actorId];
          return next;
        });
      }, BUBBLE_HOLD_MS);
    };
    gameEvents.addEventListener("npc:speak", onSpeak);
    return () => gameEvents.removeEventListener("npc:speak", onSpeak);
  }, [playerId]);

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
          name={npc.profile.name}
          action={npc.state.currentAction}
          bubble={bubbles[npc.profile.id]}
          onClick={select(npc.profile.id)}
        />
      ))}
      {player && (
        <ActorNode
          position={player.position}
          path={playerPath}
          spec={actorSpecFor("player", "#285f83")}
          name="你"
          bubble={bubbles[player.id]}
        />
      )}
    </group>
  );
}

function ActorNode({ position, path, spec, name, action, bubble, onClick }: {
  position: { x: number; y: number };
  path: { x: number; y: number }[];
  spec: VoxelActorSpec;
  name: string;
  action?: string;
  bubble?: string;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const rootRef = useRef<THREE.Group>(null);
  const poseRef = useRef<ActorPose>({ swing: 0 });
  useActorPath({ position, path, isPlayer: !onClick, rootRef, poseRef });
  const height = actorHeight(spec);

  // 只对齐一次:之后位置由 useActorPath 每帧接管。
  // 不能把 position 当成 JSX prop —— 每次 store 更新都会重渲染并把插值位置拽回服务端值,造成抖动。
  useLayoutEffect(() => {
    rootRef.current?.position.set(position.x, 0, position.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <group ref={rootRef} onClick={onClick}>
      <ActorBody spec={spec} poseRef={poseRef} />
      <ActorLabel name={name} action={action} height={height} />
      {bubble ? <ActorBubble text={bubble} height={height} /> : null}
    </group>
  );
}
