export type RendererKind = "2d" | "3d";

const STORAGE_KEY = "ai-town.renderer";

/** P0–P2 默认 2D(不改变现有演示行为);P3 会翻转为 "3d"。 */
export const DEFAULT_RENDERER: RendererKind = "2d";

export function readRendererPreference(): RendererKind {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "3d" || stored === "2d" ? stored : DEFAULT_RENDERER;
  } catch {
    return DEFAULT_RENDERER;
  }
}

export function writeRendererPreference(kind: RendererKind): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, kind);
  } catch {
    // localStorage 不可用(隐私模式/被禁)时静默降级为不记忆
  }
}
