import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { WorldBlueprint } from "@ai-town/shared";
import { TownScene } from "./TownScene";
import { useWorldStore } from "../state/world-store";

export interface TownCanvasProps {
  worldId?: string;
  blueprint?: WorldBlueprint;
  mapImageUrl?: string;
}

export function TownCanvas({ worldId, blueprint, mapImageUrl }: TownCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<TownScene | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const scene = new TownScene({ worldId, blueprint, mapImageUrl });
    sceneRef.current = scene;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: 900,
      height: 620,
      transparent: false,
      scene,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      render: { antialias: false, pixelArt: true },
    });
    let lastPathKey = "";
    let lastPlayerKey = "";
    const unsubscribe = useWorldStore.subscribe((state) => {
      scene.applyNpcs(state.npcs);
      const pathKey = JSON.stringify(state.playerPath);
      const playerKey = state.player ? `${state.player.id}:${state.player.position.x}:${state.player.position.y}` : "";
      if (pathKey !== lastPathKey) scene.applyPlayer(state.player, state.playerPath);
      else if (playerKey !== lastPlayerKey) scene.applyPlayer(state.player);
      lastPathKey = pathKey;
      lastPlayerKey = playerKey;
    });
    game.events.once(Phaser.Core.Events.READY, () => {
      const state = useWorldStore.getState();
      scene.applyNpcs(state.npcs);
      scene.applyPlayer(state.player);
      lastPathKey = JSON.stringify(state.playerPath);
      lastPlayerKey = state.player ? `${state.player.id}:${state.player.position.x}:${state.player.position.y}` : "";
    });
    return () => {
      unsubscribe();
      sceneRef.current = null;
      game.destroy(true);
    };
    // 场景只随世界挂载创建一次;blueprint/mapImageUrl 变化由下方 effect 推送到场景。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setBlueprint(blueprint, mapImageUrl);
  }, [worldId, blueprint, mapImageUrl]);

  return <div className="town-canvas" ref={hostRef} aria-label="栖溪镇实时地图" />;
}
