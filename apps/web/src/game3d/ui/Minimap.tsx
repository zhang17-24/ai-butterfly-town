import type { WorldBlueprint } from "@ai-town/shared";
import { useWorldStore } from "../../state/world-store";

const FALLBACK_MAP = "/assets/maps/qixi-town-prebuilt-v1.png";

/**
 * 3D 主视图左上角的像素小地图:复用已有的 AI 生成俯视图(Seedream 那张全图自带阴影与透视,
 * 当 3D 地面会与体素建筑打架,但当俯视小地图刚好),并实时标出居民与玩家。
 */
export function Minimap({ imageUrl, blueprint }: { imageUrl?: string; blueprint?: WorldBlueprint }) {
  const npcs = useWorldStore((state) => state.npcs);
  const player = useWorldStore((state) => state.player);
  const canvas = blueprint?.canvas ?? { width: 900, height: 620 };
  const present = (position?: { x: number; y: number }) => position
    ? { left: `${(position.x / canvas.width) * 100}%`, top: `${(position.y / canvas.height) * 100}%` }
    : undefined;

  return (
    <div className="minimap">
      <img src={imageUrl ?? FALLBACK_MAP} alt="栖溪镇俯视图" />
      {npcs.map((npc) => (
        <i
          key={npc.profile.id}
          className="minimap-dot npc"
          style={{ ...present(npc.state.position), background: npc.profile.color }}
        />
      ))}
      {player && <i className="minimap-dot player" style={present(player.position)} />}
      <span className="minimap-label">栖溪镇 · 俯视</span>
    </div>
  );
}
