/** 气泡最大字数:与 2D 保持同一规则,避免两个渲染器对同一句话显示不同长度。 */
export const BUBBLE_MAX_CHARS = 72;

export function clipBubbleText(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > BUBBLE_MAX_CHARS ? `${trimmed.slice(0, BUBBLE_MAX_CHARS).trimEnd()}…` : trimmed;
}
