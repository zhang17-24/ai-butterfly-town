export type RendererKind = "2d" | "3d";

const STORAGE_KEY = "ai-town.renderer";

/** 交付默认 3D(体素视图是这次的卖点);用户的选择由 localStorage 记住。 */
export const DEFAULT_RENDERER: RendererKind = "3d";

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
