import { Html } from "@react-three/drei";

/**
 * 名牌与气泡走 DOM 投影而不是 SDF 文字(drei 的 <Text>)。
 * 理由很实际:<Text> 走字体图集,中文会撑出一张巨大的贴图;DOM 反而能直接复用现有气泡样式。
 */
export function ActorLabel({ name, action, height }: { name: string; action?: string; height: number }) {
  return (
    <Html position={[0, height + 1, 0]} center zIndexRange={[20, 0]} pointerEvents="none">
      <div className="actor-label">
        <b>{name}</b>
        {action ? <span>{action}</span> : null}
      </div>
    </Html>
  );
}

export function ActorBubble({ text, height }: { text: string; height: number }) {
  return (
    <Html position={[0, height + 5, 0]} center zIndexRange={[40, 20]} pointerEvents="none">
      <div className="actor-bubble">{text}</div>
    </Html>
  );
}
