import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { TownScene } from "./TownScene";
import { useWorldStore } from "../state/world-store";

export function TownCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const scene = new TownScene();
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: 900,
      height: 620,
      transparent: false,
      scene,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      render: { antialias: true },
    });
    const unsubscribe = useWorldStore.subscribe((state) => scene.applyNpcs(state.npcs));
    game.events.once(Phaser.Core.Events.READY, () => scene.applyNpcs(useWorldStore.getState().npcs));
    return () => {
      unsubscribe();
      game.destroy(true);
    };
  }, []);

  return <div className="town-canvas" ref={hostRef} aria-label="栖溪镇实时地图" />;
}

